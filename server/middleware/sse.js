/**
 * SSE (Server-Sent Events) 工具函数
 */

const { SSE_EVENTS } = require('../utils/constants');

/**
 * 设置 SSE 响应头
 * @param {Response} res - Express response 对象
 */
function setupSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // 禁用 Nginx 缓冲
}

/**
 * 发送 SSE 事件
 * @param {Response} res - Express response 对象
 * @param {string} event - 事件类型 (可选)
 * @param {object} data - 事件数据
 */
function sendSSEEvent(res, event, data) {
  if (event) {
    res.write(`event: ${event}\n`);
  }
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * 发送 SSE 数据块
 * @param {Response} res - Express response 对象
 * @param {string} chunk - 数据块内容
 */
function sendSSEChunk(res, chunk) {
  sendSSEEvent(res, null, { chunk });
}

/**
 * 发送 SSE 连接成功事件
 * @param {Response} res - Express response 对象
 */
function sendSSEConnected(res) {
  sendSSEEvent(res, SSE_EVENTS.CONNECTED, {});
}

/**
 * 发送 SSE 完成事件
 * @param {Response} res - Express response 对象
 * @param {object} data - 可选的完成数据
 */
function sendSSEDone(res, data = {}) {
  sendSSEEvent(res, SSE_EVENTS.DONE, data);
}

/**
 * 发送 SSE 错误事件
 * @param {Response} res - Express response 对象
 * @param {string} errorMessage - 错误消息
 */
function sendSSEError(res, errorMessage) {
  sendSSEEvent(res, SSE_EVENTS.ERROR, { error: errorMessage });
}

module.exports = {
  setupSSE,
  sendSSEEvent,
  sendSSEChunk,
  sendSSEConnected,
  sendSSEDone,
  sendSSEError,
};
