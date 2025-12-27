/**
 * 职能沟通翻译助手 - 主应用逻辑
 * 支持两种模式：快速直出（Direct）+ 智能补齐（Interactive）
 */

import { MAX_CHARS, EXAMPLES, PLACEHOLDERS } from './config.js';
import { callDirectAPI, callAnalyzeAPI, callSynthesizeAPI, handleSSEStream } from './api.js';
import {
  renderResult,
  displayQuestions,
  showInlineLoading,
  showError,
  showCancelled,
  hideAllPanels,
  showToast,
  collectAnswers
} from './ui.js';

// ========== DOM 元素 ==========
const elements = {
  // Header
  btnPmToDev: document.getElementById('btn-pm-to-dev'),
  btnDevToPm: document.getElementById('btn-dev-to-pm'),

  // Mode
  modeInputs: document.getElementsByName('mode'),

  // Input
  inputContent: document.getElementById('input-content'),
  charCount: document.getElementById('char-count'),
  btnExample: document.getElementById('btn-example'),
  btnStart: document.getElementById('btn-start'),

  // Panels
  welcomeState: document.getElementById('welcome-state'),
  questionsPanel: document.getElementById('questions-panel'),
  questionsContainer: document.getElementById('questions-container'),
  resultPanel: document.getElementById('result-panel'),

  // Questions
  btnSkip: document.getElementById('btn-skip'),
  btnSubmitAnswers: document.getElementById('btn-submit-answers'),

  // Result
  btnCopy: document.getElementById('btn-copy'),
  btnStop: document.getElementById('btn-stop'),
  resultContentDoc: document.getElementById('result-content-doc'),
  scrollToBottomBtn: document.getElementById('scroll-to-bottom-btn')
};

// ========== 应用状态 ==========
const state = {
  direction: 'pm-to-dev',
  mode: 'direct', // 'direct' | 'interactive'
  isProcessing: false,
  analysisJson: null,
  originalText: '',
  fullResult: '',
  // 用于取消请求的控制器
  abortController: null,
  // 用于停止流式读取的控制器
  streamReader: null
};

// ========== 初始化 ==========
function init() {
  // 绑定事件
  elements.btnPmToDev.addEventListener('click', () => setDirection('pm-to-dev'));
  elements.btnDevToPm.addEventListener('click', () => setDirection('dev-to-pm'));
  elements.btnExample.addEventListener('click', fillExample);
  elements.btnStart.addEventListener('click', handleStart);
  elements.btnSkip.addEventListener('click', skipAndContinue);
  elements.btnSubmitAnswers.addEventListener('click', submitAnswers);
  elements.btnCopy.addEventListener('click', copyResult);
  elements.btnStop.addEventListener('click', handleStopStreaming);
  elements.inputContent.addEventListener('input', updateCharCount);

  // 回到底部按钮点击事件
  elements.scrollToBottomBtn?.addEventListener('click', () => {
    elements.resultContentDoc.scrollTo({
      top: elements.resultContentDoc.scrollHeight,
      behavior: 'smooth'
    });
    elements.scrollToBottomBtn.classList.add('hidden');
  });

  // Mode change
  elements.modeInputs.forEach(input => {
    input.addEventListener('change', handleModeChange);
  });

  // 事件委托：处理动态生成的取消按钮
  elements.resultContentDoc.addEventListener('click', (e) => {
    if (e.target.id === 'btn-cancel-loading') {
      handleCancelRequest();
    }
  });

  // 初始化 Marked 配置
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
  }

  console.log('职能沟通翻译助手已初始化');
}

// ========== 方向切换 ==========
function setDirection(direction) {
  if (state.isProcessing) return;

  state.direction = direction;

  // 更新按钮样式（适配卡片式布局）
  const isPmToDev = direction === 'pm-to-dev';

  // PM to DEV 按钮
  if (isPmToDev) {
    elements.btnPmToDev.classList.remove('border-slate-200', 'bg-white');
    elements.btnPmToDev.classList.add('border-blue-500', 'bg-blue-50');
  } else {
    elements.btnPmToDev.classList.remove('border-blue-500', 'bg-blue-50');
    elements.btnPmToDev.classList.add('border-slate-200', 'bg-white');
  }

  // DEV to PM 按钮
  if (!isPmToDev) {
    elements.btnDevToPm.classList.remove('border-slate-200', 'bg-white');
    elements.btnDevToPm.classList.add('border-blue-500', 'bg-blue-50');
  } else {
    elements.btnDevToPm.classList.remove('border-blue-500', 'bg-blue-50');
    elements.btnDevToPm.classList.add('border-slate-200', 'bg-white');
  }

  // 更新 aria-pressed 属性
  elements.btnPmToDev.setAttribute('aria-pressed', isPmToDev);
  elements.btnDevToPm.setAttribute('aria-pressed', !isPmToDev);

  // 清空输入框
  elements.inputContent.value = '';
  updateCharCount();

  // 动态更新placeholder
  elements.inputContent.placeholder = PLACEHOLDERS[direction];
}

// ========== 模式切换 ==========
function handleModeChange(e) {
  if (state.isProcessing) return;
  state.mode = e.target.value;
  console.log('模式切换:', state.mode);
}

// ========== 填入示例 ==========
function fillExample() {
  if (state.isProcessing) return;

  const exampleList = EXAMPLES[state.direction];
  const randomIndex = Math.floor(Math.random() * exampleList.length);
  elements.inputContent.value = exampleList[randomIndex];
  updateCharCount();
}

// ========== 更新字符计数 ==========
function updateCharCount() {
  const count = elements.inputContent.value.length;
  elements.charCount.textContent = `${count} / ${MAX_CHARS}`;

  elements.charCount.classList.remove('warning', 'error');
  if (count > MAX_CHARS) {
    elements.charCount.classList.add('error');
  } else if (count > MAX_CHARS * 0.8) {
    elements.charCount.classList.add('warning');
  }
}

// ========== 开始按钮处理 ==========
async function handleStart() {
  const content = elements.inputContent.value.trim();

  // 验证输入
  if (!content) {
    showToast('请输入内容', 'error');
    return;
  }

  if (content.length > MAX_CHARS) {
    showToast(`内容过长，请控制在${MAX_CHARS}字符以内`, 'error');
    return;
  }

  // 保存状态
  state.originalText = content;

  // 根据模式分发
  if (state.mode === 'direct') {
    await runDirectMode();
  } else {
    await runInteractiveMode();
  }
}

// ========== 快速直出模式（Direct） ==========
async function runDirectMode() {
  state.isProcessing = true;
  elements.btnStart.disabled = true;
  elements.btnStart.textContent = '生成中...';

  // 隐藏欢迎页
  hideAllPanels(elements.welcomeState, elements.questionsPanel, elements.resultPanel);

  // 使用内联loading，带取消按钮
  showInlineLoading(elements.resultPanel, elements.resultContentDoc, '正在生成翻译结果...', '取消生成');

  // 创建AbortController
  state.abortController = new AbortController();

  try {
    const response = await callDirectAPI(state.direction, state.originalText, state.abortController.signal);

    // 显示停止按钮
    elements.btnStop.classList.remove('hidden');

    // 处理 SSE 流
    state.fullResult = '';
    state.streamReader = await handleSSEStream(response, (chunk) => {
      state.fullResult += chunk;
      renderResult(elements.resultContentDoc, state.fullResult, true);
    }, () => {
      renderResult(elements.resultContentDoc, state.fullResult, false);
      showToast('生成完成', 'success');
      // 隐藏停止按钮
      elements.btnStop.classList.add('hidden');
    });

  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('请求已取消');
      return;
    }
    console.error('生成错误:', error);
    showToast(error.message, 'error');
    showError(elements.resultPanel, elements.resultContentDoc, error.message);
  } finally {
    state.isProcessing = false;
    state.abortController = null;
    state.streamReader = null;
    elements.btnStart.disabled = false;
    elements.btnStart.textContent = '开始翻译';
    elements.btnStop.classList.add('hidden');
  }
}

// ========== 智能补齐模式（Interactive） ==========
async function runInteractiveMode() {
  state.isProcessing = true;
  elements.btnStart.disabled = true;
  elements.btnStart.textContent = '分析中...';

  hideAllPanels(elements.welcomeState, elements.questionsPanel, elements.resultPanel);
  showInlineLoading(elements.resultPanel, elements.resultContentDoc, '正在分析内容，生成问题清单...', '取消分析');

  // 创建AbortController
  state.abortController = new AbortController();

  try {
    // 分析阶段：获取问题清单
    const response = await callAnalyzeAPI(state.direction, state.originalText, state.abortController.signal);

    // 处理 SSE 流
    let jsonReceived = false;
    await handleSSEStream(response,
      (chunk) => {
        // 流式输出chunk（可选显示）
        console.log('分析中:', chunk);
      },
      (data) => {
        // Done事件，包含json
        if (data.json) {
          state.analysisJson = data.json;
          jsonReceived = true;
          console.log('收到分析结果:', state.analysisJson);
        }
      }
    );

    if (!jsonReceived || !state.analysisJson) {
      throw new Error('未收到分析结果');
    }

    // 显示问题面板（使用ui.js的displayQuestions）
    displayQuestions(
      elements.questionsPanel,
      elements.questionsContainer,
      state.analysisJson,
      submitAnswers // 如果可以直接继续，则调用submitAnswers
    );

  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('请求已取消');
      return;
    }
    console.error('分析错误:', error);
    showToast(error.message, 'error');
    showError(elements.resultPanel, elements.resultContentDoc, error.message);
  } finally {
    state.isProcessing = false;
    state.abortController = null;
    elements.btnStart.disabled = false;
    elements.btnStart.textContent = '开始翻译';
  }
}

// ========== 跳过问题，直接继续 ==========
function skipAndContinue() {
  submitAnswers();
}

// ========== 提交回答并生成最终翻译 (Call 2) ==========
async function submitAnswers() {
  const answers = collectAnswers(elements.questionsContainer);

  console.log('提交回答:', answers);

  state.isProcessing = true;
  elements.btnSubmitAnswers.disabled = true;
  elements.btnSkip.disabled = true;

  // 隐藏问题面板
  elements.questionsPanel.classList.add('hidden');

  // 使用内联loading，带取消按钮
  showInlineLoading(elements.resultPanel, elements.resultContentDoc, '正在生成最终翻译稿...', '取消生成');

  // 创建AbortController
  state.abortController = new AbortController();

  try {
    const response = await callSynthesizeAPI(
      state.analysisJson,
      answers,
      state.originalText,
      state.abortController.signal
    );

    // 处理 SSE 流（带停止功能）
    state.fullResult = '';

    // 显示停止按钮
    elements.btnStop.classList.remove('hidden');

    state.streamReader = await handleSSEStream(response, (chunk) => {
      state.fullResult += chunk;
      renderResult(elements.resultContentDoc, state.fullResult, true);
    }, () => {
      renderResult(elements.resultContentDoc, state.fullResult, false);
      showToast('生成完成', 'success');
      // 隐藏停止按钮
      elements.btnStop.classList.add('hidden');
    });

    // 滚动到结果
    elements.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('请求已取消');
      return;
    }
    console.error('生成错误:', error);
    showToast(error.message, 'error');
    showError(elements.resultPanel, elements.resultContentDoc, error.message);
  } finally {
    state.isProcessing = false;
    state.abortController = null;
    state.streamReader = null;
    elements.btnSubmitAnswers.disabled = false;
    elements.btnSkip.disabled = false;
    elements.btnStop.classList.add('hidden');
  }
}

// ========== 复制结果 ==========
async function copyResult() {
  const textToCopy = state.fullResult;

  if (!textToCopy) {
    showToast('没有可复制的内容', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(textToCopy);
    showToast('已复制到剪贴板', 'success');
  } catch (error) {
    console.error('复制失败:', error);
    // 降级方案
    const textarea = document.createElement('textarea');
    textarea.value = textToCopy;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('已复制到剪贴板', 'success');
  }
}

// ========== 取消请求处理函数 ==========
function handleCancelRequest() {
  if (state.abortController) {
    state.abortController.abort();
    showToast('已取消', 'info');
  }

  // 重置状态
  state.isProcessing = false;
  state.abortController = null;
  state.streamReader = null;

  // 恢复按钮
  elements.btnStart.disabled = false;
  elements.btnStart.textContent = '开始翻译';
  elements.btnSubmitAnswers.disabled = false;
  elements.btnSkip.disabled = false;

  // 显示取消提示
  showCancelled(elements.resultContentDoc);
}

// ========== 停止流式生成 ==========
function handleStopStreaming() {
  if (state.streamReader) {
    state.streamReader.cancel();
    state.streamReader = null;
  }

  if (state.abortController) {
    state.abortController.abort();
    state.abortController = null;
  }

  // 隐藏停止按钮
  elements.btnStop.classList.add('hidden');

  // 显示已停止的提示
  showToast('已停止生成', 'info');

  // 保留已生成的内容，移除打字光标
  elements.resultContentDoc.classList.remove('typing-cursor');

  // 重置状态
  state.isProcessing = false;
  elements.btnStart.disabled = false;
  elements.btnStart.textContent = '开始翻译';
  elements.btnSubmitAnswers.disabled = false;
  elements.btnSkip.disabled = false;
}

// ========== 启动应用 ==========
document.addEventListener('DOMContentLoaded', init);
