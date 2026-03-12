import { config } from './config';
import { logger } from './logger';
import { buildAuth } from './auth';
import { parseMessage } from './parser';
import { pushBatch } from './dataStore';

// rhea 是 CommonJS 模块，require 返回的就是 container 对象
const container = require('rhea');

/**
 * 背压控制器 — 动态调整AMQP credit窗口
 */
class BackpressureController {
  private currentCredit = 200;
  private processingTime = 0;
  private lastAdjustTime = Date.now();
  private readonly MIN_CREDIT = 50;
  private readonly MAX_CREDIT = 500;
  private readonly ADJUST_INTERVAL = 5000; // 5秒调整一次

  startProcessing(): void {
    this.processingTime = Date.now();
  }

  endProcessing(): void {
    if (this.processingTime > 0) {
      const duration = Date.now() - this.processingTime;
      this.adjustCredit(duration);
      this.processingTime = 0;
    }
  }

  private adjustCredit(duration: number): void {
    const now = Date.now();
    if (now - this.lastAdjustTime < this.ADJUST_INTERVAL) return;

    this.lastAdjustTime = now;
    
    // 根据处理时间动态调整credit
    if (duration > 100) {
      // 处理太慢，减少credit
      this.currentCredit = Math.max(this.MIN_CREDIT, this.currentCredit - 50);
      logger.info(`处理慢(${duration}ms)，减少credit到${this.currentCredit}`);
    } else if (duration < 50) {
      // 处理很快，增加credit
      this.currentCredit = Math.min(this.MAX_CREDIT, this.currentCredit + 50);
      logger.info(`处理快(${duration}ms)，增加credit到${this.currentCredit}`);
    }
  }

  getCurrentCredit(): number {
    return this.currentCredit;
  }
}

const backpressure = new BackpressureController();

export function startConsumer(): void {
  const auth = buildAuth();
  const host = `${config.uid}.iot-amqp.${config.region}.aliyuncs.com`;

  logger.info(`连接 AMQP: ${host}:5671`);
  logger.info(`消费组: ${config.consumerGroupId}`);
  logger.info(`userName: ${auth.userName}`);

  // 按照阿里云官方 Node.js SDK 示例创建连接
  const connection = container.connect({
    host,
    port:         5671,
    transport:    'tls',
    reconnect:    true,
    reconnect_limit: 3,
    idle_time_out: 60000,
    username:     auth.userName,
    password:     auth.password,
  });

  // 创建 Receiver Link（动态credit窗口）
  let receiver: any = null;
  
  function createReceiver() {
    const credit = backpressure.getCurrentCredit();
    logger.info(`创建Receiver，初始credit: ${credit}`);
    
    receiver = connection.open_receiver({
      source: {
        address:  config.consumerGroupId,
        // 从最早位点开始消费，消费组内所有未过期消息都会重新推过来
        // 如果想从最新位点开始（只消费新数据），把 value 改成 'latest'
        filter: {
          'apache.org:selector-filter:string': {
            descriptor: 'apache.org:selector-filter:string',
            value: 'earliest',
          },
        },
      },
      credit_window: credit,
    });
  }
  
  createReceiver();

  // 在 container 上监听消息（官方示例写法）
  container.on('message', (context: any) => {
    backpressure.startProcessing();
    
    const msg = context.message;
    const rawBody = msg.body;
    const batch = parseMessage(rawBody);

    if (!batch) {
      context.delivery?.accept();
      backpressure.endProcessing();
      return;
    }

    // 推送到内存存储 + WebSocket 广播（替代控制台打印）
    pushBatch(batch);

    // 发送 ACK
    context.delivery.accept();
    
    backpressure.endProcessing();
    
    // 动态调整credit窗口
    const newCredit = backpressure.getCurrentCredit();
    if (receiver && receiver.flow) {
      receiver.flow({ credit_window: newCredit });
    }
  });

  container.on('connection_open', () => {
    logger.info('AMQP 连接成功，开始消费 trace 数据...');
  });

  container.on('disconnected', (context: any) => {
    logger.error(`AMQP 断开: ${context?.error?.message ?? '未知原因'}，等待重连...`);
  });

  container.on('connection_error', (context: any) => {
    logger.error(`AMQP 错误: ${context?.error?.message}`);
  });

  container.on('receiver_error', (context: any) => {
    logger.error(`Receiver 错误: ${context?.error?.message}`);
  });
}
