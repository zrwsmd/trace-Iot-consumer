// Windows 环境下阿里云 AMQP TLS 证书链可能不完整，跳过验证
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { logger }         from './logger';
import { startConsumer }  from './consumer';
import { startWebServer } from './server';

logger.info('============================================');
logger.info('  Trace Consumer 启动（可视化仪表盘模式）');
logger.info('============================================');

// 先启动 Web 服务器，再连接 AMQP
startWebServer();
startConsumer();

process.on('SIGINT',  () => { logger.info('收到 SIGINT，退出');  process.exit(0); });
process.on('SIGTERM', () => { logger.info('收到 SIGTERM，退出'); process.exit(0); });
process.on('uncaughtException',  (e: Error)   => logger.error(`uncaughtException: ${e.message}`));
process.on('unhandledRejection', (e: unknown) => logger.error(`unhandledRejection: ${e}`));
