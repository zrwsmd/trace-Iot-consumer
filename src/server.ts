import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from './logger';
import { setBroadcast, getStats, getRecentFrames, getColumns, getAllFrames } from './dataStore';

const PORT = 4000;

export function startWebServer(): void {
  const app = express();
  const httpServer = createServer(app);

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/stats', (_req, res) => {
    res.json(getStats());
  });

  app.get('/api/history', (_req, res) => {
    const allFrames = getAllFrames();
    res.json({
      total: allFrames.length,
      frames: allFrames,
      stats: getStats(),
    });
  });

  // WebSocket — 精简广播，序列化一次发给所有客户端
  const wss = new WebSocketServer({ server: httpServer });
  const clients = new Set<WebSocket>();

  function broadcast(event: string, data: unknown): void {
    if (clients.size === 0) return;
    const message = JSON.stringify({ event, data });
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
        } catch {
          clients.delete(ws);
        }
      }
    }
  }

  wss.on('connection', (ws) => {
    clients.add(ws);
    logger.info(`WebSocket 客户端连接，当前: ${clients.size}`);

    // 发送初始数据（只发给新连接的客户端）
    const initMsg = JSON.stringify({
      event: 'init',
      data: {
        stats:   getStats(),
        columns: getColumns(),
        recent:  getRecentFrames(500),
      },
    });
    try { ws.send(initMsg); } catch { /* ignore */ }

    ws.on('close', () => {
      clients.delete(ws);
      logger.info(`WebSocket 客户端断开，当前: ${clients.size}`);
    });

    ws.on('error', (err) => {
      logger.error(`WebSocket 错误: ${err.message}`);
      clients.delete(ws);
    });
  });

  // 注册广播函数 — dataStore定时调用
  setBroadcast((event, data) => {
    broadcast(event, data);
  });

  httpServer.listen(PORT, () => {
    logger.info(`可视化仪表盘已启动: http://localhost:${PORT}`);
  });
}
