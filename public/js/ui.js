/**
 * UI 渲染层
 * 处理所有 DOM 渲染和更新操作
 */

/**
 * 渲染翻译结果（Markdown）
 * @param {HTMLElement} resultContentDoc - 结果容器元素
 * @param {string} markdown - Markdown 内容
 * @param {boolean} isStreaming - 是否正在流式输出
 */
export function renderResult(resultContentDoc, markdown, isStreaming) {
  if (typeof marked === 'undefined') {
    resultContentDoc.textContent = markdown;
    return;
  }

  const html = marked.parse(markdown);
  resultContentDoc.innerHTML = html;

  if (isStreaming) {
    resultContentDoc.classList.add('typing-cursor');
  } else {
    resultContentDoc.classList.remove('typing-cursor');
  }

  // 智能滚动：仅当用户在底部时才自动滚动
  const container = resultContentDoc;
  const threshold = 100;
  const isNearBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < threshold;

  const scrollToBottomBtn = document.getElementById('scroll-to-bottom-btn');

  if (isNearBottom) {
    container.scrollTop = container.scrollHeight;
    if (scrollToBottomBtn) {
      scrollToBottomBtn.classList.add('hidden');
    }
  } else {
    if (scrollToBottomBtn) {
      scrollToBottomBtn.classList.remove('hidden');
    }
  }
}

/**
 * 显示问题列表
 * @param {HTMLElement} questionsPanel - 问题面板元素
 * @param {HTMLElement} questionsContainer - 问题容器元素
 * @param {Object} analysisJson - 分析结果 JSON
 * @param {Function} onProceedDirectly - 当可以直接继续时的回调
 */
export function displayQuestions(questionsPanel, questionsContainer, analysisJson, onProceedDirectly) {
  const { missing_info, can_proceed_directly } = analysisJson;

  // 如果可以直接继续 或 没有问题，直接进入 Call2
  if (can_proceed_directly || !missing_info || missing_info.length === 0) {
    console.log('信息充足，直接生成结果 (can_proceed_directly:', can_proceed_directly, ')');
    onProceedDirectly();
    return;
  }

  // 否则显示问题让用户回答
  console.log('需要补充信息，显示', missing_info.length, '个问题');
  questionsPanel.classList.remove('hidden');
  questionsContainer.innerHTML = '';

  // 渲染每个问题
  missing_info.forEach(q => {
    const questionEl = createQuestionElement(q);
    questionsContainer.appendChild(questionEl);
  });

  // 滚动问题容器到顶部
  questionsContainer.scrollTop = 0;

  // 滚动到问题面板
  questionsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * 创建单个问题元素
 * @param {Object} question - 问题对象
 * @returns {HTMLElement}
 */
export function createQuestionElement(question) {
  const div = document.createElement('div');
  div.className = 'rounded-lg border bg-white p-4 shadow-sm hover:shadow-md transition-shadow';
  div.dataset.questionId = question.id;

  const isHighPriority = question.priority === 'HIGH';
  const priorityBadge = isHighPriority
    ? '<span class="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">必答</span>'
    : '<span class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">建议</span>';

  // 创建选项卡片（多选）
  let optionsHtml = '';
  if (question.options && question.options.length > 0) {
    optionsHtml = '<div class="grid grid-cols-1 gap-2">';
    question.options.forEach((option, index) => {
      optionsHtml += `
        <label class="relative flex cursor-pointer items-start gap-3 rounded-lg border-2 border-slate-200 p-3 transition-all hover:border-slate-400 hover:bg-slate-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
          <input
            type="checkbox"
            name="${question.id}"
            value="${option}"
            class="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
          >
          <span class="flex-1 text-sm text-slate-700">${option}</span>
        </label>
      `;
    });
    optionsHtml += '</div>';
  }

  // 添加"其他"输入框
  const otherInputHtml = `
    <div class="mt-3">
      <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
        <input
          type="checkbox"
          name="${question.id}_other_toggle"
          class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
        >
        其他（请说明）
      </label>
      <input
        type="text"
        name="${question.id}_other"
        placeholder="请输入其他答案..."
        class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 disabled:bg-slate-50 disabled:text-slate-400"
        disabled
      >
    </div>
  `;

  div.innerHTML = `
    <div class="mb-3 flex items-start justify-between gap-3">
      <div class="flex-1">
        <div class="flex items-center gap-2">
          ${priorityBadge}
          <span class="text-xs font-mono text-slate-400">${question.id}</span>
        </div>
        <h3 class="mt-2 text-sm font-semibold text-slate-900">${question.question}</h3>
      </div>
    </div>
    <div class="mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <span class="font-medium">为什么需要：</span>${question.reason}
    </div>
    <div class="space-y-3">
      ${optionsHtml}
      ${otherInputHtml}
    </div>
  `;

  // 添加"其他"输入框的启用/禁用逻辑
  const otherToggle = div.querySelector(`input[name="${question.id}_other_toggle"]`);
  const otherInput = div.querySelector(`input[name="${question.id}_other"]`);

  if (otherToggle && otherInput) {
    otherToggle.addEventListener('change', (e) => {
      otherInput.disabled = !e.target.checked;
      if (e.target.checked) {
        otherInput.focus();
      } else {
        otherInput.value = '';
      }
    });
  }

  return div;
}

/**
 * 显示内联加载动画（带取消按钮）
 * @param {HTMLElement} resultPanel - 结果面板元素
 * @param {HTMLElement} resultContentDoc - 结果内容容器
 * @param {string} text - 加载文本
 * @param {string} cancelText - 取消按钮文本
 */
export function showInlineLoading(resultPanel, resultContentDoc, text = '正在处理...', cancelText = '取消') {
  resultPanel.classList.remove('hidden');
  resultContentDoc.innerHTML = `
    <div class="flex flex-col items-center justify-center h-full py-16 animate-fade-in">
      <div class="rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 p-8 shadow-lg border border-slate-200">
        <div class="flex flex-col items-center gap-4">
          <div class="relative">
            <div class="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"></div>
            <div class="absolute inset-0 h-12 w-12 animate-pulse rounded-full border-4 border-blue-200 opacity-20"></div>
          </div>
          <div class="text-center">
            <div class="text-sm font-semibold text-slate-900">${text}</div>
            <div class="mt-1 text-xs text-slate-600">请稍候片刻</div>
          </div>
          <button
            id="btn-cancel-loading"
            class="mt-4 rounded-lg border-2 border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors"
          >
            ${cancelText}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 显示错误状态
 * @param {HTMLElement} resultPanel - 结果面板元素
 * @param {HTMLElement} resultContentDoc - 结果内容容器
 * @param {string} message - 错误消息
 */
export function showError(resultPanel, resultContentDoc, message) {
  resultPanel.classList.remove('hidden');
  resultContentDoc.innerHTML = `
    <div class="flex items-center justify-center h-full text-red-600">
      <div class="text-center">
        <div class="text-4xl mb-2">⚠️</div>
        <div class="text-sm font-medium">${message}</div>
      </div>
    </div>
  `;
}

/**
 * 显示取消状态
 * @param {HTMLElement} resultContentDoc - 结果内容容器
 */
export function showCancelled(resultContentDoc) {
  resultContentDoc.innerHTML = `
    <div class="flex items-center justify-center h-full text-slate-600">
      <div class="text-center">
        <div class="text-4xl mb-2">⏸️</div>
        <div class="text-sm font-medium">操作已取消</div>
      </div>
    </div>
  `;
}

/**
 * 隐藏所有面板
 * @param {HTMLElement} welcomeState - 欢迎页面元素
 * @param {HTMLElement} questionsPanel - 问题面板元素
 * @param {HTMLElement} resultPanel - 结果面板元素
 */
export function hideAllPanels(welcomeState, questionsPanel, resultPanel) {
  welcomeState.classList.add('hidden');
  questionsPanel.classList.add('hidden');
  resultPanel.classList.add('hidden');
}

/**
 * 显示 Toast 提示
 * @param {string} message - 提示消息
 * @param {string} type - 提示类型 ('info' | 'success' | 'error')
 */
export function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

/**
 * 收集用户回答
 * @param {HTMLElement} questionsContainer - 问题容器元素
 * @returns {Array} 答案数组
 */
export function collectAnswers(questionsContainer) {
  const answers = [];
  const questionItems = questionsContainer.querySelectorAll('[data-question-id]');

  questionItems.forEach(item => {
    const questionId = item.dataset.questionId;
    const selectedOptions = [];

    // 收集所有选中的选项（不包括"其他"的toggle）
    const checkboxes = item.querySelectorAll(`input[name="${questionId}"]:checked`);
    checkboxes.forEach(cb => {
      selectedOptions.push(cb.value);
    });

    // 收集"其他"输入框的内容
    const otherToggle = item.querySelector(`input[name="${questionId}_other_toggle"]`);
    const otherInput = item.querySelector(`input[name="${questionId}_other"]`);

    if (otherToggle && otherToggle.checked && otherInput && otherInput.value.trim()) {
      selectedOptions.push(`其他: ${otherInput.value.trim()}`);
    }

    // 如果有答案，添加到答案列表
    if (selectedOptions.length > 0) {
      answers.push({
        id: questionId,
        answer: selectedOptions.join('; ')
      });
    }
  });

  return answers;
}
