/**
 * 请求验证中间件
 */

const { DIRECTION, MAX_CONTENT_LENGTH } = require('../utils/constants');

/**
 * 验证环境变量是否配置
 */
function validateEnvVars(req, res, next) {
  if (!process.env.LLM_API_KEY) {
    return res.status(500).json({
      error: '服务器未配置 LLM_API_KEY，请检查 .env 文件'
    });
  }

  if (!process.env.LLM_API_BASE_URL) {
    return res.status(500).json({
      error: '服务器未配置 LLM_API_BASE_URL，请检查 .env 文件'
    });
  }

  if (!process.env.LLM_MODEL) {
    return res.status(500).json({
      error: '服务器未配置 LLM_MODEL，请检查 .env 文件'
    });
  }

  next();
}

/**
 * 验证翻译请求参数 (用于 /api/direct 和 /api/interactive/analyze)
 */
function validateTranslateRequest(req, res, next) {
  const { direction, content } = req.body;

  // 验证 direction
  if (!direction || !Object.values(DIRECTION).includes(direction)) {
    return res.status(400).json({
      error: '无效的翻译方向，请使用 pm-to-dev 或 dev-to-pm'
    });
  }

  // 验证 content 存在
  if (!content || content.trim().length === 0) {
    return res.status(400).json({
      error: '请输入需要翻译的内容'
    });
  }

  // 验证 content 长度
  if (content.length > MAX_CONTENT_LENGTH) {
    return res.status(400).json({
      error: `输入内容过长，请控制在${MAX_CONTENT_LENGTH}字符以内`
    });
  }

  next();
}

/**
 * 验证合成阶段请求参数
 */
function validateSynthesizeRequest(req, res, next) {
  const { analysisJson, answers, originalText } = req.body;

  if (!analysisJson) {
    return res.status(400).json({
      error: '缺少 analysisJson 参数'
    });
  }

  if (!originalText || originalText.trim().length === 0) {
    return res.status(400).json({
      error: '缺少 originalText 参数'
    });
  }

  if (!answers || !Array.isArray(answers)) {
    return res.status(400).json({
      error: 'answers 必须是数组'
    });
  }

  next();
}

module.exports = {
  validateEnvVars,
  validateTranslateRequest,
  validateSynthesizeRequest,
};
