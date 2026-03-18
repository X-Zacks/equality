# Delta Spec: Clipboard Paste Attachment

## ADDED Requirements

### Requirement: 剪贴板图片粘贴
用户在对话输入框中执行 Ctrl+V（或系统粘贴快捷键），且剪贴板中包含图片数据时，系统 SHALL：
1. 阻止默认的粘贴行为（防止乱码写入输入框）
2. 将图片数据保存为临时 PNG 文件，路径格式为 `{TEMP}\equality-paste\paste-{timestamp}-{uuid4前8位}.png`
3. 以与 📎 按钮相同的附件标签形式显示该图片
4. 临时文件目录不存在时自动创建

#### Scenario: 粘贴截图
- GIVEN 用户使用截图工具（Snipaste / Windows Snip & Sketch 等）截图
- WHEN 用户在对话输入框中按 Ctrl+V
- THEN 出现附件标签 `🖼️ paste-xxx.png ✕`，输入框文本内容不变

#### Scenario: 粘贴浏览器中的图片
- GIVEN 用户在浏览器中右键图片选择"复制图片"
- WHEN 用户在对话输入框中按 Ctrl+V  
- THEN 出现附件标签 `🖼️ paste-xxx.png ✕`

### Requirement: 剪贴板文件粘贴
用户在对话输入框中执行 Ctrl+V，且剪贴板中包含从文件管理器复制的文件时，系统 SHALL：
1. 阻止默认粘贴行为
2. 提取文件的本地绝对路径
3. 以与拖拽相同的附件标签形式显示

#### Scenario: 从文件管理器复制文件后粘贴
- GIVEN 用户在 Windows 文件管理器中按 Ctrl+C 复制了一个文件
- WHEN 用户在对话输入框中按 Ctrl+V
- THEN 出现对应文件的附件标签（图标根据扩展名显示）

### Requirement: 纯文本不拦截
剪贴板中只含有纯文本时，系统 SHALL 执行默认粘贴行为（文本插入输入框），不创建附件。

#### Scenario: 粘贴普通文本
- GIVEN 用户复制了一段文字
- WHEN 用户在对话输入框中按 Ctrl+V
- THEN 文字正常插入输入框，无附件标签出现

### Requirement: 附件数量上限在粘贴时同样生效
粘贴附件时遵守与 📎 按钮相同的 5 个上限规则。

#### Scenario: 已有 5 个附件时粘贴
- GIVEN 输入区已有 5 个附件标签
- WHEN 用户粘贴图片
- THEN 附件标签数量不增加，静默忽略（可选：显示提示）

### Requirement: 临时文件 Tauri Command
系统 SHALL 提供 Tauri command `write_temp_file`：
- 接收参数：`data: Vec<u8>`（图片二进制）、`filename: String`
- 返回：文件的绝对路径字符串
- 目录不存在时自动创建 `{TEMP}/equality-paste/`
- 写入失败时返回 `Err(String)`，前端降级为不添加附件

## MODIFIED Requirements

### Requirement: 附件添加入口（来自 Phase 3.3）
原有：📎 按钮（文件选择对话框）、拖拽放置  
**新增**：剪贴板粘贴（Ctrl+V）

三种入口均使用同一个 `addAttachments(paths: string[])` 函数，保持行为一致。
