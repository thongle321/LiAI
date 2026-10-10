/** Base-chat-template presets (PocketPal parity: utils/chat.ts chatTemplates).
 *
 * The strings are VERBATIM from chat-formatter@0.3.4 (pocketpal's own
 * dependency) — generated from the package, never hand-transcribed, so a
 * template cannot drift a character. Picking a preset in the model's
 * "Edit Chat Template" dialog REPLACES the whole config (tokens, template,
 * system prompt, addGenerationPrompt) exactly as PocketPal does.
 *
 * "custom" is the default and the empty template: llama.rn then applies the
 * GGUF's own jinja template, which is right for every standard model.
 * None of these presets add BOS/EOS tokens by default (addBosToken/
 * addEosToken are false across the package's templates) — the tokens are
 * carried for the ones that name them, so a future package version that
 * enables them ports faithfully.
 */

export interface ChatTemplatePreset {
  /** PocketPal's config name — persisted on the model so the picker can
   *  show what is selected without matching templates by content. */
  name: string;
  addBosToken: boolean;
  addEosToken: boolean;
  bosToken: string;
  eosToken: string;
  addGenerationPrompt: boolean;
  systemPrompt: string;
  chatTemplate: string;
}

export const CHAT_TEMPLATES: Record<string, ChatTemplatePreset> = {
  /** "custom": the model default — empty template and tokens, so
   *  llama.rn uses the GGUF's own jinja template verbatim. */
  custom: {
    name: "custom",
    addBosToken: false,
    addEosToken: false,
    bosToken: "",
    eosToken: "",
    addGenerationPrompt: true,
    systemPrompt: "",
    chatTemplate: "",
  },
  /** chatML (chat-formatter token pair from the same package). */
  chatML: {
    name: "chatML",
    addBosToken: false,
    addEosToken: false,
    bosToken: "",
    eosToken: "",
    addGenerationPrompt: true,
    systemPrompt: "You are a helpful conversational chat assistant. You are precise, concise, and casual.",
    chatTemplate: "{%- if messages[0].role == 'system' -%}   {%- set offset = 1 -%}{%- else %}    {%- set offset = 0 -%}{%- endif -%}{{- bos_token -}}{%- for message in messages -%}    {%- if (message.role == 'user') != (loop.index0 % 2 == offset) -%}        {{ raise_exception('Conversation roles must alternate user/assistant/user/assistant/...') }}    {%- endif -%}    {{- '<|im_start|>' + message.role + '\n' + message.content | trim + '<|im_end|>\n' -}}{%- endfor -%}{%- if add_generation_prompt -%}    {{- '<|im_start|>assistant\n' -}}{%- endif -%}",
  },
  /** danube2 (chat-formatter token pair from the same package). */
  danube2: {
    name: "danube2",
    addBosToken: false,
    addEosToken: false,
    bosToken: "<s>",
    eosToken: "</s>",
    addGenerationPrompt: true,
    systemPrompt: "You are a helpful assistant named H2O Danube2. You are precise, concise, and casual.",
    chatTemplate: "{%- if messages[0].role == 'system' -%}    {%- set system_message = messages[0].content + eos_token -%}    {%- set messages = messages.slice(1) -%}{%- else -%}    {%- set system_message = '' -%}{%- endif %}{{- system_message -}}{%- for message in messages -%}    {%- if message.role == 'user' -%}        {{- '<|prompt|>' + message.content + eos_token -}}    {%- elif message.role == 'assistant' -%}        {{- '<|answer|>'  + message['content'] + eos_token -}}    {%- endif -%}    {%- if loop.last and add_generation_prompt -%}        {{- '<|answer|>' -}}    {%- endif -%}{%- endfor -%}",
  },
  /** danube3 (chat-formatter token pair from the same package). */
  danube3: {
    name: "danube3",
    addBosToken: false,
    addEosToken: false,
    bosToken: "<s>",
    eosToken: "</s>",
    addGenerationPrompt: true,
    systemPrompt: "You are a helpful assistant named H2O Danube3. You are precise, concise, and casual.",
    chatTemplate: "{%- if messages[0].role == 'system' -%}{%- set system_message = messages[0].content | trim + eos_token -%}{%- set messages = messages.slice(1) -%}{%- else -%}{%- set system_message = '' -%}{%- endif %}{{- system_message -}}{%- for message in messages -%}{%- if ((message['role'] == 'user') != (loop.index0 % 2 == 0)) or ((message['role'] == 'assistant') != (loop.index0 % 2 == 1)) -%}{{- raise_exception('Conversation roles must alternate user/assistant/user/assistant/...') -}}{%- endif -%}{%- if message['role'] == 'user' -%}{{- '<|prompt|>' + message['content'] | trim + eos_token -}}{%- elif message['role'] == 'assistant' -%}{{- '<|answer|>' + message['content'] | trim + eos_token -}}{%- endif -%}{%- endfor -%}{%- if add_generation_prompt -%}{{- '<|answer|>' -}}{%- endif -%}",
  },
  /** default (chat-formatter token pair from the same package). */
  default: {
    name: "default",
    addBosToken: false,
    addEosToken: false,
    bosToken: "",
    eosToken: "",
    addGenerationPrompt: true,
    systemPrompt: "You are a helpful conversational chat assistant. You are precise, concise, and casual.",
    chatTemplate: "{%- for message in messages -%}    {{'<|im_start|>' + message.role + '\n' + message.content + '<|im_end|>\n'}}{%- endfor -%}{%- if add_generation_prompt and messages[messages.length - 1].role != 'assistant' -%}    {{ '<|im_start|>assistant\n' }}{%- endif -%}",
  },
  /** gemmaIt (chat-formatter token pair from the same package). */
  gemmaIt: {
    name: "gemmaIt",
    addBosToken: false,
    addEosToken: false,
    bosToken: "<bos>",
    eosToken: "<eos>",
    addGenerationPrompt: true,
    systemPrompt: "You are a helpful conversational chat assistant. You are precise, concise, and casual.",
    chatTemplate: "{{- bos_token -}}{%- if messages[0].role == 'system' -%}{%- set system_message = messages[0].content | trim + '\\n\\n' -%}{%- set messages = messages.slice(1) -%}{%- else -%}{%- set system_message = '' -%}{%- endif %}{%- for message in messages -%}{%- if (message.role == 'user') != (loop.index0 % 2 == 0) -%}{{- raise_exception('Conversation roles must alternate user/assistant/user/assistant/...') -}}{%- endif -%}{%- if loop.index0 == 0 -%}{%- set content = system_message + message.content -%}{%- else -%}{%- set content = message.content -%}{%- endif -%}{%- if message.role == 'assistant' -%}{%- set role = 'model' -%}{%- else -%}{%- set role = message.role -%}{%- endif -%}{{- '<start_of_turn>' + role + '\\n' + (content | trim) + '<end_of_turn>\\n' -}}{%- endfor -%}{%- if add_generation_prompt -%}{{- '<start_of_turn>model\\n' -}}{%- endif -%}",
  },
  /** gemmasutra (chat-formatter token pair from the same package). */
  gemmasutra: {
    name: "gemmasutra",
    addBosToken: false,
    addEosToken: false,
    bosToken: "<bos>",
    eosToken: "<eos>",
    addGenerationPrompt: true,
    systemPrompt: "You are a helpful conversational chat assistant. You are precise, concise, and casual.",
    chatTemplate: "{{- bos_token -}}{%- for message in messages -%}{%- set content = message.content -%}{%- if (message.role == 'assistant') -%}{%- set role = 'model' -%}{%- else -%}{%- set role = message.role -%}{%- endif -%}{{- '<start_of_turn>' + role + '\\n' + (content | trim) + '<end_of_turn>\\n' -}}{%- endfor -%}{%- if add_generation_prompt -%}{{- '<start_of_turn>model\\n' -}}{%- endif -%}",
  },
  /** llama3 (chat-formatter token pair from the same package). */
  llama3: {
    name: "llama3",
    addBosToken: false,
    addEosToken: false,
    bosToken: "<|begin_of_text|>",
    eosToken: "<|end_of_text|>",
    addGenerationPrompt: true,
    systemPrompt: "You are a helpful conversational chat assistant. You are precise, concise, and casual.",
    chatTemplate: "{%- set loop_messages = messages -%}{%- for message in loop_messages -%}    {%- set content = '<|start_header_id|>' + message.role + '<|end_header_id|>\n\n'+ message.content | trim + '<|eot_id|>' -%}    {%- if loop.index0 == 0 -%}        {%- set content = bos_token + content -%}    {%- endif -%}    {{- content -}}{%- endfor -%}{%- if add_generation_prompt -%}    {{- '<|start_header_id|>assistant<|end_header_id|>\n\n' -}}{%- endif -%}",
  },
  /** llama32 (chat-formatter token pair from the same package). */
  llama32: {
    name: "llama32",
    addBosToken: false,
    addEosToken: false,
    bosToken: "<|begin_of_text|>",
    eosToken: "<|eot_id|>",
    addGenerationPrompt: true,
    systemPrompt: "",
    chatTemplate: "{{- bos_token }}{%- if custom_tools is defined %}{%- set tools = custom_tools %}{%- endif %}{%- if tools_in_user_message is not defined %}{%- set tools_in_user_message = true %}{%- endif %}{%- if date_string is not defined %}{%- if strftime_now is defined %}{%- set date_string = strftime_now('%d %b %Y') %}{%- else %}{%- set date_string = '26 Jul 2024' %}{%- endif %}{%- endif %}{%- if tools is not defined %}{%- set tools = none %}{%- endif %}{#- This block extracts the system message, so we can slot it into the right place. #}{%- if messages[0]['role'] == 'system' %}{%- set system_message = messages[0]['content'] | trim %}{%- set messages = messages.slice(1) %}{%- else %}{%- set system_message = '' %}{%- endif %}{#- System message #}{{- '<|start_header_id|>system<|end_header_id|>\n\n' }}{%- if tools is not none %}{{- 'Environment: ipython\n' }}{%- endif %}{{- 'Cutting Knowledge Date: December 2023\n' }}{{- 'Today Date: ' + date_string + '\n\n' }}{%- if tools is not none and not tools_in_user_message %}{{- 'You have access to the following functions. To call a function, please respond with JSON for a function call.' }}{{- 'Respond in the format {\"name\": function name, \"parameters\": dictionary of argument name and its value}.' }}{{- 'Do not use variables.\n\n' }}{%- for t in tools %}{{- t | dump(4) }}{{- '\n\n' }}{%- endfor %}{%- endif %}{{- system_message }}{{- '<|eot_id|>' }}{# Custom tools are passed in a user message with some extra guidance #}{%- if tools_in_user_message and tools is not none %}{#- Extract the first user message so we can plug it in here #}{%- if messages.length != 0 %}{%- set first_user_message = messages[0]['content'] | trim %}{%- set messages = messages.slice(1) %}{%- else %}{{- raise_exception('Cannot put tools in the first user message when there is no first user message!') }}{%- endif %}{{- '<|start_header_id|>user<|end_header_id|>\n\n' }}{{- 'Given the following functions, please respond with a JSON for a function call ' }}{{- 'with its proper arguments that best answers the given prompt.\n\n' }}{{- 'Respond in the format {\"name\": function name, \"parameters\": dictionary of argument name and its value}.' }}{{- 'Do not use variables.\n\n' }}{%- for t in tools %}{{- t | dump(4) }}{{- '\n\n' }}{%- endfor %}{{- first_user_message + '<|eot_id|>' }}{%- endif %}{%- for message in messages %}{%- if not (message.role == 'ipython' or message.role == 'tool' or 'tool_calls' in message) %}{{- '<|start_header_id|>' + message['role'] + '<|end_header_id|>\n\n' + message['content'] | trim + '<|eot_id|>' }}{%- elif 'tool_calls' in message %}{%- if message.tool_calls.length != 1 %}{{- raise_exception('This model only supports single tool-calls at once!') }}{%- endif %}{%- set tool_call = message.tool_calls[0].function %}{{- '<|start_header_id|>assistant<|end_header_id|>\n\n' }}{{- '{\"name\": \"' + tool_call.name + '\", ' }}{{- '\"parameters\": ' }}{{- tool_call.arguments | dump }}{{- '}' }}{{- '<|eot_id|>' }}{%- elif message.role == 'tool' or message.role == 'ipython' %}{{- '<|start_header_id|>ipython<|end_header_id|>\n\n' }}{%- if message.content is mapping or message.content is iterable %}{{- message.content | dump }}{%- else %}{{- message.content }}{%- endif %}{{- '<|eot_id|>' }}{%- endif %}{%- endfor %}{%- if add_generation_prompt %}{{- '<|start_header_id|>assistant<|end_header_id|>\n\n' }}{%- endif %}",
  },
  /** phi3 (chat-formatter token pair from the same package). */
  phi3: {
    name: "phi3",
    addBosToken: false,
    addEosToken: false,
    bosToken: "<s>",
    eosToken: "<|endoftext|>",
    addGenerationPrompt: true,
    systemPrompt: "You are a helpful conversational chat assistant. You are precise, concise, and casual.",
    chatTemplate: "{%- for message in messages -%}{%- if message.role == 'system' -%}{{- '<|system|>\\n' + message.content | trim + '<|end|>\\n' -}}{%- elif message.role == 'user' -%}{{- '<|user|>\\n' + message.content | trim + '<|end|>\\n' -}}{%- elif message.role == 'assistant' -%}{{- '<|assistant|>\\n' + message.content | trim + '<|end|>\\n' -}}{%- endif -%}{%- endfor -%}{%- if add_generation_prompt -%}{{- '<|assistant|>\\n' -}}{%- else -%}{{- eos_token -}}{%- endif -%}",
  },
  /** qwen2 (chat-formatter token pair from the same package). */
  qwen2: {
    name: "qwen2",
    addBosToken: false,
    addEosToken: false,
    bosToken: "",
    eosToken: "<|im_end|>",
    addGenerationPrompt: true,
    systemPrompt: "You are a helpful assistant.",
    chatTemplate: "{%- for message in messages -%}{%- if loop.first and messages[0].role != 'system' -%}{{- '<|im_start|>system\\nYou are a helpful assistant<|im_end|>\\n' -}}{%- endif -%}{{- '<|im_start|>' + message.role + '\\n' + message.content + '<|im_end|>\\n' -}}{%- endfor -%}{%- if add_generation_prompt -%}{{- '<|im_start|>assistant\\n' -}}{%- endif -%}",
  },
  /** qwen25 (chat-formatter token pair from the same package). */
  qwen25: {
    name: "qwen25",
    addBosToken: false,
    addEosToken: false,
    bosToken: "",
    eosToken: "<|im_end|>",
    addGenerationPrompt: true,
    systemPrompt: "You are Qwen, created by Alibaba Cloud. You are a helpful assistant.",
    chatTemplate: "{%- if tools -%}{{- '<|im_start|>system\\n' }}{%- if messages[0]['role'] == 'system' -%}{{- messages[0]['content'] }}{%- else -%}{{- 'You are Qwen, created by Alibaba Cloud. You are a helpful assistant.' }}{%- endif -%}{{- '\\n\\n# Tools\\n\\nYou may call one or more functions to assist with the user query.\\n\\nYou are provided with function signatures within <tools></tools> XML tags:\\n<tools>' }}{%- for tool in tools -%}{{- '\\n' }}{{- tool | tojson }}{%- endfor -%}{{- '\\n</tools>\\n\\nFor each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:\\n<tool_call>\\n{\"name\": <function-name>, \"arguments\": <args-json-object>}\\n</tool_call><|im_end|>\\n' }}{%- else -%}{%- if messages[0]['role'] == 'system' -%}{{- '<|im_start|>system\\n' + messages[0]['content'] + '<|im_end|>\\n' }}{%- else -%}{{- '<|im_start|>system\\nYou are Qwen, created by Alibaba Cloud. You are a helpful assistant.<|im_end|>\\n' }}{%- endif -%}{%- endif -%}{%- for message in messages -%}{%- if (message.role == 'user') or (message.role == 'system' and not loop.first) or (message.role == 'assistant' and not message.tool_calls) -%}{{- '<|im_start|>' + message.role + '\\n' + message.content + '<|im_end|>\\n' }}{%- elif message.role == 'assistant' -%}{{- '<|im_start|>' + message.role }}{%- if message.content -%}{{- '\\n' + message.content }}{%- endif -%}{%- for tool_call in message.tool_calls -%}{%- if tool_call.function is defined -%}{%- set tool_call = tool_call.function -%}{%- endif -%}{{- '\\n<tool_call>\\n{\"name\": \"' }}{{- tool_call.name }}{{- '\", \"arguments\": ' }}{{- tool_call.arguments | tojson }}{{- '}\\n</tool_call>' }}{%- endfor -%}{{- '<|im_end|>\\n' }}{%- elif message.role == 'tool' -%}{%- if (loop.index0 == 0) or (messages[loop.index0 - 1].role != 'tool') -%}{{- '<|im_start|>user' }}{%- endif -%}{{- '\\n<tool_response>\\n' }}{{- message.content }}{{- '\\n</tool_response>' }}{%- if loop.last or (messages[loop.index0 + 1].role != 'tool') -%}{{- '<|im_end|>\\n' }}{%- endif -%}{%- endif -%}{%- endfor -%}{%- if add_generation_prompt -%}{{- '<|im_start|>assistant\\n' }}{%- endif -%}",
  },
  smolLM: {
    name: "smolLM",
    addBosToken: false,
    addEosToken: false,
    bosToken: "",
    eosToken: "",
    addGenerationPrompt: true,
    systemPrompt: "You are a helpful assistant.",
    chatTemplate: "",
  },
  smolVLM: {
    name: "smolVLM",
    addBosToken: false,
    addEosToken: false,
    bosToken: "",
    eosToken: "",
    addGenerationPrompt: true,
    systemPrompt: "",
    chatTemplate: "",
  },
};

/** Preset names in PocketPal's order (the dropdown order). */
export const CHAT_TEMPLATE_NAMES = Object.keys(CHAT_TEMPLATES);

export function getChatTemplate(name: string): ChatTemplatePreset {
  return CHAT_TEMPLATES[name] ?? CHAT_TEMPLATES.custom;
}
