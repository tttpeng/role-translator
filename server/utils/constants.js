/**
 * 应用常量定义
 */

module.exports = {
  // LLM 配置
  DEFAULT_MODEL: 'gpt-4o',
  MAX_TOKENS: 4000,

  // 验证限制
  MAX_CONTENT_LENGTH: 10000,

  // 翻译方向
  DIRECTION: {
    PM_TO_DEV: 'pm-to-dev',
    DEV_TO_PM: 'dev-to-pm',
  },

  // SSE 事件类型
  SSE_EVENTS: {
    CONNECTED: 'connected',
    DONE: 'done',
    ERROR: 'error',
  },
};
