import { RemoteRunnable } from "@langchain/core/runnables/remote";
import { exposeEndpoints, streamRunnableUI } from "@/utils/server";

import "server-only"; // вказує, що цей код виконується лише на сервері
import { StreamEvent } from "@langchain/core/tracers/log_stream";
import { EventHandlerFields } from "@/utils/server";
import { Github, GithubLoading } from "@/components/prebuilt/github";
import { InvoiceLoading, Invoice } from "@/components/prebuilt/invoice";
import {
  CurrentWeatherLoading,
  CurrentWeather,
} from "@/components/prebuilt/weather";
import { createStreamableUI, createStreamableValue } from "ai/rsc";
import { AIMessage } from "@/ai/message";

// URL API, до якого надсилатимуться запити для обробки чат-сесій
const API_URL = "http://localhost:8000/chat";

// тип даних для компонентів інструментів з окремими компонентами для завантаження і фінального стану
type ToolComponent = {
  loading: (props?: any) => JSX.Element;
  final: (props?: any) => JSX.Element;
};

// відповідність між типом інструменту та його компонентами
type ToolComponentMap = {
  [tool: string]: ToolComponent;
};

// мапа інструментів із відповідними компонентами для завантаження та фінального результату
const TOOL_COMPONENT_MAP: ToolComponentMap = {
  "github-repo": {
    loading: (props?: any) => <GithubLoading {...props} />,
    final: (props?: any) => <Github {...props} />,
  },
  "invoice-parser": {
    loading: (props?: any) => <InvoiceLoading {...props} />,
    final: (props?: any) => <Invoice {...props} />,
  },
  "weather-data": {
    loading: (props?: any) => <CurrentWeatherLoading {...props} />,
    final: (props?: any) => <CurrentWeather {...props} />,
  },
};


// функція для управління сесією агента
async function agent(inputs: {
  input: string; // поточне введення користувача
  chat_history: [role: string, content: string][]; // історія чату
  file?: {
    base64: string; // файли, які можна надіслати в базовому64
    extension: string; // розширення файлу
  };
}) {
  "use server"; // Ця функція виконується тільки на сервері

  // створення віддаленого об'єкта для надсилання запитів до API
  // підключення Lang serve api до backend !!!
  const remoteRunnable = new RemoteRunnable({
    url: API_URL,
  });

  let selectedToolComponent: ToolComponent | null = null; // обраний інструмент
  let selectedToolUI: ReturnType<typeof createStreamableUI> | null = null; // UI для вибраного інструменту

  /**
   * Обробка події 'invoke_model': визначає, чи обраний інструмент викликається, і якщо так,
   * додає його інтерфейс для завантаження.
   */
  const handleInvokeModelEvent = (
    event: StreamEvent,
    fields: EventHandlerFields,
  ) => {
    const [type] = event.event.split("_").slice(2);
    if (
      type !== "end" ||
      !event.data.output ||
      typeof event.data.output !== "object" ||
      event.name !== "invoke_model"
    ) {
      return;
    }

    // перевірка на виклик інструмента та його додавання до UI, якщо він ще не був вибраний
    if (
      "tool_calls" in event.data.output &&
      event.data.output.tool_calls.length > 0
    ) {
      const toolCall = event.data.output.tool_calls[0];
      if (!selectedToolComponent && !selectedToolUI) {
        selectedToolComponent = TOOL_COMPONENT_MAP[toolCall.type];
        selectedToolUI = createStreamableUI(selectedToolComponent.loading());
        fields.ui.append(selectedToolUI?.value);
      }
    }
  };

  /**
   * Обробка події 'invoke_tools': коли інструмент завершує роботу, його фінальний результат оновлює UI.
   */
  const handleInvokeToolsEvent = (event: StreamEvent) => {
    const [type] = event.event.split("_").slice(2);
    if (
      type !== "end" ||
      !event.data.output ||
      typeof event.data.output !== "object" ||
      event.name !== "invoke_tools"
    ) {
      return;
    }

    // оновлення фінального стану UI вибраного інструменту з його результатами
    if (selectedToolUI && selectedToolComponent) {
      const toolData = event.data.output.tool_result;
      selectedToolUI.done(selectedToolComponent.final(toolData));
    }
  };

  /**
   * Обробка події 'on_chat_model_stream': створює текстовий потік для AI повідомлення
   * та додає текстовий контент до потоку.
   */
  const handleChatModelStreamEvent = (
    event: StreamEvent,
    fields: EventHandlerFields,
  ) => {
    if (
      event.event !== "on_chat_model_stream" ||
      !event.data.chunk ||
      typeof event.data.chunk !== "object"
    )
      return;
    
    // якщо для поточного run_id немає текстового потоку, створює його і додає до UI
    if (!fields.callbacks[event.run_id]) {
      const textStream = createStreamableValue();
      fields.ui.append(<AIMessage value={textStream.value} />);
      fields.callbacks[event.run_id] = textStream;
    }

    // додає новий текстовий контент до потоку
    if (fields.callbacks[event.run_id]) {
      fields.callbacks[event.run_id].append(event.data.chunk.content);
    }
  };

  // функція повертає інтерфейс для чату, що оновлюється в режимі реального часу на основі подій
  return streamRunnableUI(
    remoteRunnable,
    {
      input: [
        ...inputs.chat_history.map(([role, content]) => ({
          type: role,
          content,
        })),
        {
          type: "human",
          content: inputs.input,
        },
      ],
    },
    {
      eventHandlers: [
        handleInvokeModelEvent,
        handleInvokeToolsEvent,
        handleChatModelStreamEvent,
      ],
    },
  );
}

// експортую контекст з доступом до endpoint "agent" для використання в додатку
export const EndpointsContext = exposeEndpoints({ agent });
