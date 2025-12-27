/**
 * API 通信层
 * 处理所有与后端的通信，包括 SSE 流处理
 */

/**
 * 快速直出模式 API
 * @param {string} direction - 翻译方向 ('pm-to-dev' | 'dev-to-pm')
 * @param {string} content - 原始内容
 * @param {AbortSignal} signal - 用于取消请求的信号
 * @returns {Promise<Response>}
 */
export async function callDirectAPI(direction, content, signal) {
  const response = await fetch('/api/direct', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      direction,
      content
    }),
    signal
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '生成失败');
  }

  return response;
}

/**
 * 智能补齐模式 - 分析阶段 API
 * @param {string} direction - 翻译方向
 * @param {string} content - 原始内容
 * @param {AbortSignal} signal - 用于取消请求的信号
 * @returns {Promise<Response>}
 */
export async function callAnalyzeAPI(direction, content, signal) {
  const response = await fetch('/api/interactive/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      direction,
      content
    }),
    signal
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '分析失败');
  }

  return response;
}

/**
 * 智能补齐模式 - 综合阶段 API
 * @param {Object} analysisJson - 分析结果 JSON
 * @param {Array} answers - 用户回答
 * @param {string} originalText - 原始文本
 * @param {AbortSignal} signal - 用于取消请求的信号
 * @returns {Promise<Response>}
 */
export async function callSynthesizeAPI(analysisJson, answers, originalText, signal) {
  const response = await fetch('/api/interactive/synthesize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      analysisJson,
      answers,
      originalText
    }),
    signal
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '生成失败');
  }

  return response;
}

/**
 * 处理 SSE 流
 * @param {Response} response - Fetch 响应对象
 * @param {Function} onChunk - 接收到 chunk 时的回调
 * @param {Function} onDone - 完成时的回调
 * @returns {Promise<void>}
 */
export async function handleSSEStream(response, onChunk, onDone) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = { type: '', data: '' };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 解析 SSE 消息（按事件块处理）
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent.type = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentEvent.data = line.slice(6);
        } else if (line === '') {
          // 空行表示事件块结束，处理当前事件
          if (currentEvent.data) {
            try {
              const json = JSON.parse(currentEvent.data);

              // 处理 chunk 数据（流式输出）
              if (json.chunk) {
                onChunk(json.chunk);
              }

              // 处理完成事件
              if (currentEvent.type === 'done') {
                onDone(json);
              }
            } catch (e) {
              console.error('JSON 解析错误:', e, '原始数据:', currentEvent.data);
            }
          }
          // 重置当前事件
          currentEvent = { type: '', data: '' };
        }
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Stream已取消');
    } else {
      throw error;
    }
  }

  return reader;
}
