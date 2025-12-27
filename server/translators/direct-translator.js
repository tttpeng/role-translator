const OpenAI = require('openai');
const UNIFIED_PROMPTS = require('../prompts/prompts');
const logger = require('../utils/logger');
const { DEFAULT_MODEL, MAX_TOKENS } = require('../utils/constants');

class DirectTranslator {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.LLM_API_KEY,
      baseURL: process.env.LLM_API_BASE_URL
    });
    this.model = process.env.LLM_MODEL || DEFAULT_MODEL;
  }

  /**
   * 获取对应方向的系统提示词（Direct 模式）
   */
  getSystemPrompt(direction) {
    switch (direction) {
      case 'pm-to-dev':
        return UNIFIED_PROMPTS.direct.pmToDev;
      case 'dev-to-pm':
        return UNIFIED_PROMPTS.direct.devToPm;
      default:
        throw new Error(`未知的翻译方向: ${direction}`);
    }
  }

  /**
   * 构建用户消息
   */
  buildUserMessage(content, direction) {
    const roleLabel = direction === 'pm-to-dev' ? '产品经理' : '开发工程师';
    return `以下是${roleLabel}的原始描述，请进行翻译：

---
${content}
---

请按照指定格式输出翻译结果。`;
  }

  /**
   * 流式翻译
   * @param {string} direction - 翻译方向 'pm-to-dev' | 'dev-to-pm'
   * @param {string} content - 用户输入内容
   * @param {function} onChunk - 收到内容片段时的回调
   * @param {function} onDone - 完成时的回调
   * @param {function} onError - 错误时的回调
   */
  async translateStream(direction, content, onChunk, onDone, onError) {
    const startTime = Date.now();
    let fullResponse = '';

    try {
      const systemPrompt = this.getSystemPrompt(direction);
      const userMessage = this.buildUserMessage(content, direction);

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ];

      // 记录 LLM 调用开始
      logger.logLlmCall({
        model: this.model,
        direction,
        mode: 'direct',
        max_tokens: MAX_TOKENS,
        stream: true,
        contentLength: content.length
      });

      // 记录完整请求内容
      logger.logLlmRequest({
        model: this.model,
        direction,
        mode: 'direct',
        stream: true,
        messages
      });

      const stream = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        messages,
        stream: true
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullResponse += delta;
          onChunk(delta);
        }
      }

      // 记录 LLM 响应成功
      const duration = Date.now() - startTime;
      logger.logLlmResponse({
        model: this.model,
        direction,
        mode: 'direct',
        responseLength: fullResponse.length,
        duration
      });

      // 记录完整响应内容
      logger.logLlmFullResponse({
        model: this.model,
        direction,
        mode: 'direct',
        duration,
        responseLength: fullResponse.length,
        responseContent: fullResponse
      });

      onDone();

    } catch (error) {
      // 记录错误
      logger.logError('TRANSLATOR_STREAM', error);
      onError(error);
    }
  }

  /**
   * 非流式翻译（用于测试）
   */
  async translate(direction, content) {
    const startTime = Date.now();

    try {
      const systemPrompt = this.getSystemPrompt(direction);
      const userMessage = this.buildUserMessage(content, direction);

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ];

      // 记录 LLM 调用开始
      logger.logLlmCall({
        model: this.model,
        direction,
        mode: 'direct',
        max_tokens: MAX_TOKENS,
        stream: false,
        contentLength: content.length
      });

      // 记录完整请求内容
      logger.logLlmRequest({
        model: this.model,
        direction,
        mode: 'direct',
        stream: false,
        messages
      });

      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        messages
      });

      const result = response.choices[0].message.content;

      // 记录 LLM 响应成功
      const duration = Date.now() - startTime;
      logger.logLlmResponse({
        model: this.model,
        direction,
        mode: 'direct',
        responseLength: result.length,
        duration
      });

      // 记录完整响应内容
      logger.logLlmFullResponse({
        model: this.model,
        direction,
        mode: 'direct',
        duration,
        responseLength: result.length,
        responseContent: result
      });

      return result;

    } catch (error) {
      logger.logError('TRANSLATOR_NON_STREAM', error);
      throw error;
    }
  }
}

module.exports = DirectTranslator;
