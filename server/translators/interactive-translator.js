const OpenAI = require('openai');
const UNIFIED_PROMPTS = require('../prompts/prompts');
const logger = require('../utils/logger');
const { DEFAULT_MODEL, MAX_TOKENS } = require('../utils/constants');

/**
 * 交互式翻译器（Interactive Translator）
 * Analysis → 用户交互 → Synthesis
 */
class InteractiveTranslator {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.LLM_API_KEY,
      baseURL: config.baseURL || process.env.LLM_API_BASE_URL,
      model: config.model || process.env.LLM_MODEL || DEFAULT_MODEL
    };

    if (!this.config.apiKey || !this.config.baseURL) {
      throw new Error('缺少必要的 API 配置(apiKey 或 baseURL)');
    }

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL
    });
  }

  /**
   * 根据方向获取 Analysis 提示词
   */
  getAnalysisPrompt(direction) {
    const normalizedDirection = direction === 'pm-to-dev' ? 'pmToDev' : 'devToPm';
    return UNIFIED_PROMPTS.analysis[normalizedDirection];
  }

  /**
   * 分析阶段：结构化分析(流式输出 JSON)
   * @param {object} options
   * @param {string} options.direction - 'pm-to-dev' | 'dev-to-pm'
   * @param {string} options.content - 用户输入内容
   * @param {string} options.context - 可选的上下文
   * @param {function} options.onChunk - 收到内容片段的回调
   * @param {function} options.onDone - 完成的回调 (json) => {}
   * @param {function} options.onError - 错误的回调
   */
  async analyzeStream(options) {
    const {
      direction,
      content,
      context = '',
      onChunk,
      onDone,
      onError
    } = options;

    const startTime = Date.now();

    try {
      const analysisPrompt = this.getAnalysisPrompt(direction);
      const systemPrompt = analysisPrompt.system;
      const userPrompt = analysisPrompt.getUserPrompt(content, context);

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      // 记录 LLM 调用开始
      logger.logLlmCall({
        model: this.config.model,
        direction,
        mode: 'interactive-analyze',
        max_tokens: MAX_TOKENS,
        stream: true,
        contentLength: content.length
      });

      // 记录完整请求内容
      logger.logLlmRequest({
        model: this.config.model,
        direction,
        mode: 'interactive-analyze',
        stream: true,
        messages
      });

      const stream = await this.client.chat.completions.create({
        model: this.config.model,
        max_tokens: MAX_TOKENS,
        messages,
        stream: true,
        response_format: { type: 'json_object' }
      });

      let fullText = '';

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          if (onChunk) {
            onChunk(delta);
          }
        }
      }

      // 解析完整的 JSON
      try {
        const json = JSON.parse(fullText);

        // 记录 LLM 响应成功
        const duration = Date.now() - startTime;
        logger.logLlmResponse({
          model: this.config.model,
          direction,
          mode: 'interactive-analyze',
          responseLength: fullText.length,
          duration
        });

        // 记录完整响应内容
        logger.logLlmFullResponse({
          model: this.config.model,
          direction,
          mode: 'interactive-analyze',
          duration,
          responseLength: fullText.length,
          responseContent: fullText
        });

        logger.logInfo('ANALYZE_RESULT', {
          questionsCount: json.missing_info?.length || 0,
          canProceedDirectly: json.can_proceed_directly,
          confidenceScore: json.confidence_score
        });

        onDone(json);
      } catch (parseError) {
        logger.logError('JSON_PARSE', parseError);
        logger.logDebug('RAW_RESPONSE', fullText);
        onError(new Error('AI 返回的内容不是有效的 JSON'));
      }

    } catch (error) {
      logger.logError('ANALYZE_STREAM', error);
      onError(error);
    }
  }

  /**
   * 分析阶段：非流式(用于测试)
   */
  async analyze(direction, content, context = '') {
    const startTime = Date.now();

    try {
      const analysisPrompt = this.getAnalysisPrompt(direction);
      const systemPrompt = analysisPrompt.system;
      const userPrompt = analysisPrompt.getUserPrompt(content, context);

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      // 记录 LLM 调用开始
      logger.logLlmCall({
        model: this.config.model,
        direction,
        mode: 'interactive-analyze',
        max_tokens: MAX_TOKENS,
        stream: false,
        contentLength: content.length
      });

      // 记录完整请求内容
      logger.logLlmRequest({
        model: this.config.model,
        direction,
        mode: 'interactive-analyze',
        stream: false,
        messages
      });

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        max_tokens: MAX_TOKENS,
        messages,
        response_format: { type: 'json_object' }
      });

      const text = response.choices[0].message.content;
      const json = JSON.parse(text);

      // 记录 LLM 响应成功
      const duration = Date.now() - startTime;
      logger.logLlmResponse({
        model: this.config.model,
        direction,
        mode: 'interactive-analyze',
        responseLength: text.length,
        duration
      });

      // 记录完整响应内容
      logger.logLlmFullResponse({
        model: this.config.model,
        direction,
        mode: 'interactive-analyze',
        duration,
        responseLength: text.length,
        responseContent: text
      });

      logger.logInfo('ANALYZE_RESULT', {
        questionsCount: json.missing_info?.length || 0,
        canProceedDirectly: json.can_proceed_directly,
        confidenceScore: json.confidence_score
      });

      return json;

    } catch (error) {
      logger.logError('ANALYZE_NON_STREAM', error);
      throw error;
    }
  }

  /**
   * 合成阶段：基于分析JSON + 用户answers生成最终翻译稿(流式)
   * @param {object} options
   * @param {object} options.analysisJson - 分析阶段返回的 JSON
   * @param {array} options.answers - 用户回答列表 [{id, answer}]
   * @param {string} options.originalText - 原始用户输入
   * @param {string} options.context - 可选的上下文
   * @param {function} options.onChunk - 收到内容片段的回调
   * @param {function} options.onDone - 完成的回调
   * @param {function} options.onError - 错误的回调
   */
  async synthesizeStream(options) {
    const {
      analysisJson,
      answers,
      originalText,
      context = '',
      onChunk,
      onDone,
      onError
    } = options;

    const startTime = Date.now();
    let fullResponse = '';

    try {
      // 从 analysisJson 中提取 direction
      const direction = analysisJson.direction === 'PM_TO_DEV' ? 'PM_TO_DEV' : 'DEV_TO_PM';

      // 记录 LLM 调用开始
      logger.logLlmCall({
        model: this.config.model,
        direction,
        mode: 'interactive-synthesize',
        max_tokens: MAX_TOKENS,
        stream: true,
        contentLength: originalText.length
      });

      logger.logInfo('SYNTHESIZE_INPUT', {
        answersCount: answers?.length || 0,
        originalTextLength: originalText.length
      });

      const systemPrompt = UNIFIED_PROMPTS.getSynthesisSystemPrompt(direction);
      const userPrompt = UNIFIED_PROMPTS.getSynthesisUserPrompt(
        analysisJson,
        answers,
        originalText
      );

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      // 记录完整请求内容
      logger.logLlmRequest({
        model: this.config.model,
        direction,
        mode: 'interactive-synthesize',
        stream: true,
        messages
      });

      const stream = await this.client.chat.completions.create({
        model: this.config.model,
        max_tokens: MAX_TOKENS,
        messages,
        stream: true
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullResponse += delta;
          if (onChunk) {
            onChunk(delta);
          }
        }
      }

      // 记录 LLM 响应成功
      const duration = Date.now() - startTime;
      logger.logLlmResponse({
        model: this.config.model,
        direction,
        mode: 'interactive-synthesize',
        responseLength: fullResponse.length,
        duration
      });

      // 记录完整响应内容
      logger.logLlmFullResponse({
        model: this.config.model,
        direction,
        mode: 'interactive-synthesize',
        duration,
        responseLength: fullResponse.length,
        responseContent: fullResponse
      });

      if (onDone) {
        onDone();
      }

    } catch (error) {
      logger.logError('SYNTHESIZE_STREAM', error);
      if (onError) {
        onError(error);
      }
    }
  }

  /**
   * 合成阶段：非流式(用于测试)
   */
  async synthesize(analysisJson, answers, originalText, context = '') {
    const startTime = Date.now();

    try {
      // 从 analysisJson 中提取 direction
      const direction = analysisJson.direction === 'PM_TO_DEV' ? 'PM_TO_DEV' : 'DEV_TO_PM';

      // 记录 LLM 调用开始
      logger.logLlmCall({
        model: this.config.model,
        direction,
        mode: 'interactive-synthesize',
        max_tokens: MAX_TOKENS,
        stream: false,
        contentLength: originalText.length
      });

      logger.logInfo('SYNTHESIZE_INPUT', {
        answersCount: answers?.length || 0,
        originalTextLength: originalText.length
      });

      const systemPrompt = UNIFIED_PROMPTS.getSynthesisSystemPrompt(direction);
      const userPrompt = UNIFIED_PROMPTS.getSynthesisUserPrompt(
        analysisJson,
        answers,
        originalText
      );

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      // 记录完整请求内容
      logger.logLlmRequest({
        model: this.config.model,
        direction,
        mode: 'interactive-synthesize',
        stream: false,
        messages
      });

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        max_tokens: MAX_TOKENS,
        messages
      });

      const result = response.choices[0].message.content;

      // 记录 LLM 响应成功
      const duration = Date.now() - startTime;
      logger.logLlmResponse({
        model: this.config.model,
        direction,
        mode: 'interactive-synthesize',
        responseLength: result.length,
        duration
      });

      // 记录完整响应内容
      logger.logLlmFullResponse({
        model: this.config.model,
        direction,
        mode: 'interactive-synthesize',
        duration,
        responseLength: result.length,
        responseContent: result
      });

      return result;

    } catch (error) {
      logger.logError('SYNTHESIZE_NON_STREAM', error);
      throw error;
    }
  }
}

module.exports = InteractiveTranslator;
