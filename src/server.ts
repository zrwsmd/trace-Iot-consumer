import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from './logger';
import { setBroadcast, getStats, getRecentFrames, getColumns } from './dataStore';

const PORT = 4000;

export function startWebServer(): void {
  const app = express();
  const httpServer = createServer(app);

  // 静态文件
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // REST API — 统计
  app.get('/api/stats', (_req, res) => {
    res.json(getStats());
  });

  // WebSocket
  const wss = new WebSocketServer({ server: httpServer });
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    clients.add(ws);
    logger.info(`WebSocket 客户端连接，当前: ${clients.size}`);

    // 发送初始数据
    const init = {
      event: 'init',
      data: {
        stats:   getStats(),
        columns: getColumns(),
        recent:  getRecentFrames(500),
      },
    };
    ws.send(JSON.stringify(init));

    ws.on('close', () => {
      clients.delete(ws);
      logger.info(`WebSocket 客户端断开，当前: ${clients.size}`);
    });

    ws.on('error', (err) => {
      logger.error(`WebSocket 错误: ${err.message}`);
      clients.delete(ws);
    });
  });

  // 注册广播函数
  setBroadcast((event, data) => {
    if (clients.size === 0) return;
    const msg = JSON.stringify({ event, data });
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  });

  httpServer.listen(PORT, () => {
    logger.info(`可视化仪表盘已启动: http://localhost:${PORT}`);
  });
}
