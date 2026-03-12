import { config } from './config';
import { logger } from './logger';
import { buildAuth } from './auth';
import { parseMessage } from './parser';
import { pushBatch } from './dataStore';

// rhea 是 CommonJS 模块，require 返回的就是 container 对象
const container = require('rhea');

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

  // 创建 Receiver Link（官方示例不传参数）
  connection.open_receiver({
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
    credit_window: 200,
  });

  // 在 container 上监听消息（官方示例写法）
  container.on('message', (context: any) => {
    const msg = context.message;
    const rawBody = msg.body;
    const batch = parseMessage(rawBody);

    if (!batch) {
      context.delivery?.accept();
      return;
    }

    // 推送到内存存储 + WebSocket 广播（替代控制台打印）
    pushBatch(batch);

    // 发送 ACK
    context.delivery.accept();
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
