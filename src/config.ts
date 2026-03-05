import * as dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val || val.startsWith('你的')) {
    console.error(`[config] 缺少必填配置: ${key}，请先修改 .env 文件`);
    process.exit(1);
  }
  return val!;
}

export const config = {
  accessKeyId:     required('ACCESS_KEY_ID'),
  accessKeySecret: required('ACCESS_KEY_SECRET'),
  uid:             required('ALIYUN_UID'),
  region:          process.env.IOT_REGION         ?? 'cn-shanghai',
  iotInstanceId:   process.env.IOT_INSTANCE_ID?.trim() || undefined,
  consumerGroupId: process.env.CONSUMER_GROUP_ID  ?? 'trace_consumer_group',
  logLevel:        (process.env.LOG_LEVEL         ?? 'info') as 'debug' | 'info' | 'error',
  printInterval:   parseInt(process.env.PRINT_INTERVAL ?? '100', 10),
} as const;
