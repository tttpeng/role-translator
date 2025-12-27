require('dotenv').config();

const express = require('express');
const path = require('path');
const DirectTranslator = require('./translators/direct-translator');
const InteractiveTranslator = require('./translators/interactive-translator');
const { setupSSE, sendSSEChunk, sendSSEConnected, sendSSEDone, sendSSEError } = require('./middleware/sse');
const { validateEnvVars, validateTranslateRequest, validateSynthesizeRequest } = require('./middleware/validation');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 创建翻译器实例
const directTranslator = new DirectTranslator();

/**
 * 健康检查
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    apiKeyConfigured: !!process.env.LLM_API_KEY,
    apiBaseConfigured: !!process.env.LLM_API_BASE_URL,
    modelConfigured: !!process.env.LLM_MODEL
  });
});

/**
 * 直接模式翻译接口
 * POST /api/direct
 * Body: { direction: 'pm-to-dev' | 'dev-to-pm', content: string }
 */
app.post('/api/direct', validateEnvVars, validateTranslateRequest, async (req, res) => {
  const { direction, content } = req.body;

  setupSSE(res);
  sendSSEConnected(res);

  try {
    await directTranslator.translateStream(
      direction,
      content.trim(),
      (chunk) => sendSSEChunk(res, chunk),
      () => {
        sendSSEDone(res);
        res.end();
      },
      (error) => {
        console.error('翻译错误:', error);
        sendSSEError(res, error.message || '翻译过程中发生错误');
        res.end();
      }
    );
  } catch (error) {
    console.error('请求处理错误:', error);
    sendSSEError(res, '服务器内部错误');
    res.end();
  }
});



/**
 * 交互式翻译 API
 */

/**
 * 分析阶段：结构化分析(返回JSON)
 * POST /api/interactive/analyze
 * Body: { direction: 'pm-to-dev' | 'dev-to-pm', content: string, context?: string }
 */
app.post('/api/interactive/analyze', validateEnvVars, validateTranslateRequest, async (req, res) => {
  const { direction, content, context } = req.body;

  setupSSE(res);
  sendSSEConnected(res);

  try {
    const interactiveTranslator = new InteractiveTranslator();

    await interactiveTranslator.analyzeStream({
      direction,
      content: content.trim(),
      context: context || '',
      onChunk: (chunk) => sendSSEChunk(res, chunk),
      onDone: (json) => {
        sendSSEDone(res, { json });
        res.end();
      },
      onError: (error) => {
        console.error('分析错误:', error);
        sendSSEError(res, error.message || '分析过程中发生错误');
        res.end();
      }
    });
  } catch (error) {
    console.error('请求处理错误:', error);
    sendSSEError(res, '服务器内部错误');
    res.end();
  }
});

/**
 * 合成阶段：基于JSON+answers生成最终翻译稿
 * POST /api/interactive/synthesize
 * Body: {
 *   analysisJson: object,
 *   answers: [{id, answer}],
 *   originalText: string,
 *   context?: string
 * }
 */
app.post('/api/interactive/synthesize', validateEnvVars, validateSynthesizeRequest, async (req, res) => {
  const { analysisJson, answers, originalText, context } = req.body;

  setupSSE(res);
  sendSSEConnected(res);

  try {
    const interactiveTranslator = new InteractiveTranslator();

    await interactiveTranslator.synthesizeStream({
      analysisJson,
      answers,
      originalText: originalText.trim(),
      context: context || '',
      onChunk: (chunk) => sendSSEChunk(res, chunk),
      onDone: () => {
        sendSSEDone(res);
        res.end();
      },
      onError: (error) => {
        console.error('合成错误:', error);
        sendSSEError(res, error.message || '合成过程中发生错误');
        res.end();
      }
    });
  } catch (error) {
    console.error('请求处理错误:', error);
    sendSSEError(res, '服务器内部错误');
    res.end();
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║        🔄 职能沟通翻译助手 已启动                           ║
║                                                           ║
║        访问地址: http://localhost:${PORT}                    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
  
  if (!process.env.LLM_API_KEY || !process.env.LLM_API_BASE_URL || !process.env.LLM_MODEL) {
    console.warn('⚠️  警告: 未检测到必需的环境变量');
    console.warn('   请复制 .env.example 为 .env 并配置以下变量:');
    console.warn('   - LLM_API_KEY: API 密钥');
    console.warn('   - LLM_API_BASE_URL: API 基础地址');
    console.warn('   - LLM_MODEL: 使用的模型名称');
  } else {
    console.log(`✓ 使用模型: ${process.env.LLM_MODEL}`);
    console.log(`✓ API 地址: ${process.env.LLM_API_BASE_URL}`);
  }
});
