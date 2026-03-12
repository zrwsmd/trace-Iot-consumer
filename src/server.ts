import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from './logger';
import { setBroadcast, getStats, getRecentFrames, getColumns } from './dataStore';

const PORT = 4000;

/**
 * 高性能消息广播器 — 缓存和批量优化
 */
class MessageBroadcaster {
  private msgCache = new Map<string, string>();
  private batchQueue: Array<{event: string, data: any}> = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_TIMEOUT = 50; // 50ms批量间隔

  constructor(private clients: Set<WebSocket>) {}

  broadcast(event: string, data: unknown): void {
    if (this.clients.size === 0) return;

    // 尝试从缓存获取
    const cacheKey = `${event}_${JSON.stringify(data)}`;
    let message = this.msgCache.get(cacheKey);
    
    if (!message) {
      message = JSON.stringify({ event, data });
      // 限制缓存大小，避免内存泄漏
      if (this.msgCache.size > 1000) {
        const firstKey = this.msgCache.keys().next().value;
        if (firstKey) {
          this.msgCache.delete(firstKey);
        }
      }
      this.msgCache.set(cacheKey, message);
    }

    // 批量发送优化
    this.batchQueue.push({ event, data });
    
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushBatch(), this.BATCH_TIMEOUT);
    }

    // 立即发送重要消息
    if (event === 'init') {
      this.sendImmediate(message);
    }
  }

  private flushBatch(): void {
    this.batchTimer = null;
    if (this.batchQueue.length === 0) return;

    const batch = this.batchQueue.splice(0, this.BATCH_SIZE);
    for (const {event, data} of batch) {
      const cacheKey = `${event}_${JSON.stringify(data)}`;
      const message = this.msgCache.get(cacheKey);
      if (message) {
        this.sendImmediate(message);
      }
    }

    // 如果还有待发送的消息，继续批量处理
    if (this.batchQueue.length > 0) {
      this.batchTimer = setTimeout(() => this.flushBatch(), this.BATCH_TIMEOUT);
    }
  }

  private sendImmediate(message: string): void {
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
        } catch (error) {
          logger.error(`WebSocket发送失败: ${error}`);
          this.clients.delete(ws);
        }
      }
    }
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
  }

  removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

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
  const broadcaster = new MessageBroadcaster(clients);

  wss.on('connection', (ws) => {
    broadcaster.addClient(ws);
    logger.info(`WebSocket 客户端连接，当前: ${broadcaster.getClientCount()}`);

    // 发送初始数据
    const init = {
      event: 'init',
      data: {
        stats:   getStats(),
        columns: getColumns(),
        recent:  getRecentFrames(500),
      },
    };
    broadcaster.broadcast('init', init.data);

    ws.on('close', () => {
      broadcaster.removeClient(ws);
      logger.info(`WebSocket 客户端断开，当前: ${broadcaster.getClientCount()}`);
    });

    ws.on('error', (err) => {
      logger.error(`WebSocket 错误: ${err.message}`);
      broadcaster.removeClient(ws);
    });
  });

  // 注册广播函数
  setBroadcast((event, data) => {
    broadcaster.broadcast(event, data);
  });

  httpServer.listen(PORT, () => {
    logger.info(`可视化仪表盘已启动: http://localhost:${PORT}`);
  });
}
