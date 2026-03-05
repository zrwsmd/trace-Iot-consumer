# trace-consumer（TypeScript）

阿里云 IoT 平台 Trace 数据 AMQP 消费端，收到数据直接在终端打印。

## 快速开始

### 1. 在阿里云 IoT 平台创建消费组

登录阿里云 IoT 平台控制台：
1. 进入 **规则引擎** -> **服务端订阅** -> **消费组列表**
2. 点击 **创建消费组**，名称填写：`trace_consumer_group`

### 2. 修改 .env

复制 `.env.example` 为 `.env`，然后修改配置：

```
ACCESS_KEY_ID=你的AccessKeyId
ACCESS_KEY_SECRET=你的AccessKeySecret
ALIYUN_UID=你的账号UID
CONSUMER_GROUP_ID=trace_consumer_group
# 企业版实例必填，公共实例可不填
# IOT_INSTANCE_ID=iot-xxxxxx
# 仅在本机证书链缺失时临时开启
# AMQP_INSECURE_TLS=true
```

**配置说明：**
- `ACCESS_KEY_ID` 和 `ACCESS_KEY_SECRET`：在控制台右上角头像 -> **AccessKey 管理**
- `ALIYUN_UID`：在控制台右上角头像 -> **安全设置** -> **账号ID**（纯数字）
- `CONSUMER_GROUP_ID`：上一步创建的消费组名称
- `IOT_INSTANCE_ID`：企业版实例 ID（Overview 页面可见，公共实例不需要）
- `AMQP_INSECURE_TLS`：仅用于证书链不完整环境的临时绕过

### 3. 安装依赖

```bash
npm install
```

### 4. 启动

```bash
npm run dev
```

## 终端输出示例

```
┌─────────────────────────────────────────────────────┐
│  收到 Trace 数据包
│  taskId:     sim_trace_001
│  deviceName: taiyuan-pc-001
│  seq:        1
│  period:     1ms
│  frames:     100 帧  (ts: 1 ~ 100)
└─────────────────────────────────────────────────────┘
  [前3帧预览]
  ts | axis1_position | axis1_velocity | axis1_torque | motor_rpm | pressure_bar
  ---+----------------+----------------+--------------+-----------+-------------
   1 |          0.628 |        314.159 |         50.0 |    1500.0 |         5.0
   2 |          1.257 |        313.900 |         51.2 |    1502.3 |         5.1
   3 |          1.885 |        313.500 |         52.1 |    1503.1 |         5.2
```

## 项目结构

```
trace-consumer/
├── .env
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts        # 入口
    ├── types.ts        # 类型定义
    ├── config.ts       # 读取 .env
    ├── logger.ts       # 日志
    ├── auth.ts         # AMQP 认证签名
    ├── parser.ts       # 解析消息
    ├── printHelper.ts  # 终端格式化打印
    └── consumer.ts     # AMQP 长连接消费核心
```

注意!!
如果当前控制端一直没有接受到，可能是因为没有在 IoT 控制台配置服务端订阅：
进入 消息转发 → 服务端订阅
确保订阅了 设备上报消息
