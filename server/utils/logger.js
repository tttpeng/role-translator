const fs = require('fs');
const path = require('path');

/**
 * API 日志工具
 * 同时输出到控制台和文件
 */
class ApiLogger {
  constructor() {
    // 日志目录
    this.logDir = process.env.LOG_DIR || path.join(__dirname, '../logs');

    // 确保日志目录存在
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // 日志文件路径（按日期分割）
    this.getLogFilePath = () => {
      const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      return path.join(this.logDir, `api-${date}.log`);
    };
  }

  /**
   * 格式化时间戳
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * 写入日志到文件
   */
  writeToFile(message) {
    const logFile = this.getLogFilePath();
    const logLine = `${message}\n`;

    try {
      fs.appendFileSync(logFile, logLine, 'utf8');
    } catch (error) {
      console.error('写入日志文件失败:', error);
    }
  }

  /**
   * 格式化日志消息
   */
  formatMessage(level, category, data) {
    const timestamp = this.getTimestamp();
    const message = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return `[${timestamp}] [${level}] [${category}] ${message}`;
  }

  /**
   * 记录 API 请求
   */
  logRequest(endpoint, params) {
    const message = this.formatMessage('INFO', 'REQUEST', {
      endpoint,
      params: {
        ...params,
        // 隐藏敏感信息
        content: params.content ? `${params.content.substring(0, 100)}...` : undefined
      }
    });

    console.log(message);
    this.writeToFile(message);
  }

  /**
   * 记录 LLM API 调用
   */
  logLlmCall(config) {
    const message = this.formatMessage('INFO', 'LLM_CALL', {
      model: config.model,
      direction: config.direction,
      mode: config.mode,
      max_tokens: config.max_tokens,
      stream: config.stream,
      contentLength: config.contentLength
    });

    console.log(message);
    this.writeToFile(message);
  }

  /**
   * 记录完整的 LLM 请求内容
   */
  logLlmRequest(config) {
    const separator = '='.repeat(80);
    const message = [
      '',
      separator,
      `[${this.getTimestamp()}] [REQUEST] LLM API Request`,
      separator,
      `Model: ${config.model}`,
      `Direction: ${config.direction}`,
      `Mode: ${config.mode}`,
      `Stream: ${config.stream}`,
      separator,
      'Messages:',
      JSON.stringify(config.messages, null, 2),
      separator,
      ''
    ].join('\n');

    console.log(message);
    this.writeToFile(message);
  }

  /**
   * 记录完整的 LLM 响应内容
   */
  logLlmFullResponse(config) {
    const separator = '='.repeat(80);
    const message = [
      '',
      separator,
      `[${this.getTimestamp()}] [RESPONSE] LLM API Response`,
      separator,
      `Model: ${config.model}`,
      `Direction: ${config.direction}`,
      `Mode: ${config.mode}`,
      `Duration: ${config.duration}ms`,
      `Response Length: ${config.responseLength} characters`,
      separator,
      'Response Content:',
      config.responseContent,
      separator,
      ''
    ].join('\n');

    console.log(message);
    this.writeToFile(message);
  }

  /**
   * 记录 LLM API 响应
   */
  logLlmResponse(config) {
    const message = this.formatMessage('INFO', 'LLM_RESPONSE', {
      model: config.model,
      direction: config.direction,
      mode: config.mode,
      responseLength: config.responseLength,
      duration: config.duration ? `${config.duration}ms` : undefined
    });

    console.log(message);
    this.writeToFile(message);
  }

  /**
   * 记录错误
   */
  logError(category, error) {
    const message = this.formatMessage('ERROR', category, {
      message: error.message,
      stack: error.stack,
      code: error.code,
      status: error.status
    });

    console.error(message);
    this.writeToFile(message);
  }

  /**
   * 记录一般信息
   */
  logInfo(category, data) {
    const message = this.formatMessage('INFO', category, data);
    console.log(message);
    this.writeToFile(message);
  }

  /**
   * 记录调试信息
   */
  logDebug(category, data) {
    if (process.env.DEBUG === 'true') {
      const message = this.formatMessage('DEBUG', category, data);
      console.log(message);
      this.writeToFile(message);
    }
  }
}

// 单例模式
const logger = new ApiLogger();

module.exports = logger;
