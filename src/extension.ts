import * as vscode from 'vscode';

interface TriggerConfig {
  pattern: string;
  onStart?: string;
  onEnd?: string;
  description?: string;
}

let statusBarItem: vscode.StatusBarItem;
let statusBarTimeout: NodeJS.Timeout | undefined;
let activeExecutions = new Map<vscode.TerminalShellExecution, RegExp>();

export function activate(context: vscode.ExtensionContext) {
  console.log('Terminal Command Trigger is now active');

  // 创建状态栏项（初始隐藏）
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  context.subscriptions.push(statusBarItem);

  // 检查 Shell Integration（仅第一次）
  checkShellIntegration(context);

  // 监听终端命令开始
  context.subscriptions.push(
    vscode.window.onDidStartTerminalShellExecution((event) => {
      handleTerminalCommandStart(event.execution);
    })
  );

  // 监听终端命令结束
  context.subscriptions.push(
    vscode.window.onDidEndTerminalShellExecution((event) => {
      handleTerminalCommandEnd(event.execution);
    })
  );

  console.log('Terminal Command Trigger: Listening for terminal commands');
}

async function checkShellIntegration(context: vscode.ExtensionContext) {
  const hasShownWarning = context.globalState.get('shownShellIntegrationWarning');

  if (hasShownWarning) {
    return;
  }

  // 等待终端初始化
  setTimeout(() => {
    const terminals = vscode.window.terminals;
    const hasIntegration = terminals.some(t => t.shellIntegration);

    if (!hasIntegration && terminals.length === 0) {
      // 没有终端，等待用户打开终端后再检查
      const disposable = vscode.window.onDidOpenTerminal((terminal) => {
        setTimeout(() => {
          if (!terminal.shellIntegration) {
            showShellIntegrationWarning(context);
          }
          disposable.dispose();
        }, 2000);
      });
      return;
    }

    if (!hasIntegration) {
      showShellIntegrationWarning(context);
    }

    context.globalState.update('shownShellIntegrationWarning', true);
  }, 3000);
}

function showShellIntegrationWarning(context: vscode.ExtensionContext) {
  vscode.window.showWarningMessage(
    'Terminal Command Trigger: Shell Integration not detected. Auto-trigger may not work. ' +
    'Please use a supported shell (PowerShell, bash, zsh, fish).',
    'Learn More',
    'Don\'t Show Again'
  ).then(selection => {
    if (selection === 'Learn More') {
      vscode.env.openExternal(
        vscode.Uri.parse('https://code.visualstudio.com/docs/terminal/shell-integration')
      );
    } else if (selection === 'Don\'t Show Again') {
      context.globalState.update('shownShellIntegrationWarning', true);
    }
  });
}

function handleTerminalCommandStart(execution: vscode.TerminalShellExecution) {
  const commandLine = execution.commandLine.value.trim();
  
  if (!commandLine) {
    return;
  }

  // 读取配置
  const config = vscode.workspace.getConfiguration('terminalCommandTrigger');
  const triggers = config.get<TriggerConfig[]>('triggers', []);
  const showNotification = config.get<boolean>('showNotification', true);

  // 匹配触发器
  for (const trigger of triggers) {
    try {
      const regex = new RegExp(trigger.pattern);
      
      if (regex.test(commandLine)) {
        console.log(`Terminal Command Trigger: Matched START "${commandLine}" with pattern "${trigger.pattern}"`);
        
        // 记录当前执行和对应的正则（用于 onEnd）
        activeExecutions.set(execution, regex);
        
        // 执行 onStart 动作
        if (trigger.onStart) {
          executeAction(trigger.onStart, 'onStart').then(
            () => {
              console.log(`Terminal Command Trigger: Executed onStart "${trigger.onStart}"`);
              
              if (showNotification) {
                showTemporaryNotification(`⚡ Start: ${trigger.onStart}`);
              }
            },
            (error) => {
              console.error(`Terminal Command Trigger: Failed to execute onStart "${trigger.onStart}":`, error);
              vscode.window.showErrorMessage(
                `Terminal Command Trigger: Failed to execute "${trigger.onStart}"`
              );
            }
          );
        }
        
        // 只匹配第一个触发器
        break;
      }
    } catch (error) {
      console.error(`Terminal Command Trigger: Invalid regex pattern "${trigger.pattern}":`, error);
      vscode.window.showErrorMessage(
        `Terminal Command Trigger: Invalid regex pattern "${trigger.pattern}"`
      );
    }
  }
}

function handleTerminalCommandEnd(execution: vscode.TerminalShellExecution) {
  const regex = activeExecutions.get(execution);
  
  if (!regex) {
    return; // 这个命令没有匹配的触发器
  }

  // 清理记录
  activeExecutions.delete(execution);

  const commandLine = execution.commandLine.value.trim();
  console.log(`Terminal Command Trigger: Command END "${commandLine}"`);

  // 读取配置
  const config = vscode.workspace.getConfiguration('terminalCommandTrigger');
  const triggers = config.get<TriggerConfig[]>('triggers', []);
  const showNotification = config.get<boolean>('showNotification', true);

  // 找到对应的触发器
  for (const trigger of triggers) {
    try {
      const triggerRegex = new RegExp(trigger.pattern);
      
      if (triggerRegex.toString() === regex.toString()) {
        // 执行 onEnd 动作
        if (trigger.onEnd) {
          executeAction(trigger.onEnd, 'onEnd').then(
            () => {
              console.log(`Terminal Command Trigger: Executed onEnd "${trigger.onEnd}"`);
              
              if (showNotification) {
                showTemporaryNotification(`✅ End: ${trigger.onEnd}`);
              }
            },
            (error) => {
              console.error(`Terminal Command Trigger: Failed to execute onEnd "${trigger.onEnd}":`, error);
              vscode.window.showErrorMessage(
                `Terminal Command Trigger: Failed to execute "${trigger.onEnd}"`
              );
            }
          );
        }
        
        break;
      }
    } catch (error) {
      console.error(`Terminal Command Trigger: Error in onEnd handler:`, error);
    }
  }
}

async function executeAction(action: string, phase: 'onStart' | 'onEnd'): Promise<void> {
  if (action.startsWith('ext:')) {
    // 扩展 API 调用：ext:extensionId:api.path
    const parts = action.slice(4).split(':'); // 去掉 'ext:' 前缀
    
    if (parts.length < 2) {
      throw new Error(`Invalid extension API syntax: ${action}. Expected format: ext:extensionId:api.path`);
    }
    
    const extensionId = parts[0];
    const apiPath = parts.slice(1).join(':'); // 支持 api.path 中有 ':'
    
    console.log(`Terminal Command Trigger: Calling extension API - ${extensionId} -> ${apiPath}`);
    
    const extension = vscode.extensions.getExtension(extensionId);
    
    if (!extension) {
      throw new Error(`Extension not found: ${extensionId}`);
    }
    
    const api = await extension.activate();
    
    // 遍历 API 路径（如 client.stop）
    const pathParts = apiPath.split('.');
    let target: any = api;
    
    for (let i = 0; i < pathParts.length - 1; i++) {
      target = target?.[pathParts[i]];
      if (!target) {
        throw new Error(`API path not found: ${apiPath} (failed at ${pathParts.slice(0, i + 1).join('.')})`);
      }
    }
    
    const methodName = pathParts[pathParts.length - 1];
    const method = target[methodName];
    
    if (typeof method !== 'function') {
      throw new Error(`Not a function: ${apiPath} (type: ${typeof method})`);
    }
    
    // 调用方法
    return method.call(target);
    
  } else {
    // VSCode 命令
    console.log(`Terminal Command Trigger: Executing VSCode command - ${action}`);
    return vscode.commands.executeCommand(action);
  }
}

function showTemporaryNotification(message: string) {
  const config = vscode.workspace.getConfiguration('terminalCommandTrigger');
  const duration = config.get<number>('notificationDuration', 3000);
  
  // 清除之前的超时
  if (statusBarTimeout) {
    clearTimeout(statusBarTimeout);
  }

  // 显示消息
  statusBarItem.text = message;
  statusBarItem.show();

  // 设置自动隐藏
  statusBarTimeout = setTimeout(() => {
    statusBarItem.hide();
    statusBarTimeout = undefined;
  }, duration);
}

export function deactivate() {
  if (statusBarTimeout) {
    clearTimeout(statusBarTimeout);
  }
  statusBarItem.dispose();
  activeExecutions.clear();
}