/*
server.tsx - typescript, логіка щодо оброки потокових компонентів інтерфейсу користувача на сервері
             Потокові компоненти оновлюють UI в реальному часі при отриманні даних з потоку
*/

import "server-only";
import { AIProvider } from "./client";
import { ReactNode } from "react";
import { Runnable } from "@langchain/core/runnables";
import { CompiledStateGraph } from "@langchain/langgraph";
import { createStreamableUI, createStreamableValue } from "ai/rsc";
import { StreamEvent } from "@langchain/core/tracers/log_stream";

export const LAMBDA_STREAM_WRAPPER_NAME = "lambda_stream_wrapper";


// тип для колбеків, які відповідають за потоки UI та значень
export type RunUICallbacks = Record<
  string,
  ReturnType<typeof createStreamableUI | typeof createStreamableValue>
>;


// тип для полів, що містять UI та колбеки
export type EventHandlerFields = {
  ui: ReturnType<typeof createStreamableUI>;
  callbacks: RunUICallbacks;
};


// тип для обробників подій, які працюють з потоком 
export type EventHandler =
  | ((event: StreamEvent, fields: EventHandlerFields) => void)
  | ((event: StreamEvent, fields: EventHandlerFields) => Promise<void>);


/**
 * Виконує метод `streamEvents` у runnable об'єкті
 * та конвертує генератор в потік, який підтримується React Server Components (RSC)
 *
 * @param runnable - об'єкт, який можна виконувати, підтримуючий потокові події
 * @returns React-елемент, який можна відправити клієнту
 */
export function streamRunnableUI<RunInput, RunOutput>(
  runnable:
    | Runnable<RunInput, RunOutput>
    | CompiledStateGraph<RunInput, Partial<RunInput>>,
  inputs: RunInput,
  options: {
    eventHandlers: Array<EventHandler>;
  },
) {
  // створюємо об'єкт для потокового UI
  const ui = createStreamableUI(); 

  // ініціалізуємо об'єкт для останньої події
  const [lastEvent, resolve] = withResolvers< Array<any> | Record<string, any>>(); 
  let shouldRecordLastEvent = true; 

  (async () => {
    let lastEventValue: StreamEvent | null = null; // тримаємо останню подію потоку

    // об'єкт зворотніх викликів для текстових потоків, щоб можна було оновлювати їх в інтерфейсі
    const callbacks: RunUICallbacks = {}; 

    // Функція отримує події через асинхронний цикл за допомогою for await і 
    // працює з кожною подією, що генерується методом streamEvents

    // "conditional edge" - який саме агент буде активовано !!!
    for await (const streamEvent of (
      runnable as Runnable<RunInput, RunOutput>
    ).streamEvents(inputs, {
      version: "v1",
    })) {
      for await (const handler of options.eventHandlers) {
        await handler(streamEvent, {
          ui,
          callbacks,
        });
      }

      // перевіряємо, чи подія відповідає власній події UI і чи її значення є валідним елементом React
      if (shouldRecordLastEvent) {
        lastEventValue = streamEvent; 
      }
      // якщо подія вказує на завершення ланцюга, припиняємо запис останньої події
      if (
        streamEvent.data.chunk?.name === "LangGraph" &&
        streamEvent.data.chunk?.event === "on_chain_end"
      ) {
        shouldRecordLastEvent = false;
      }
    }

    // Завершуємо обробку потоку та повідомляємо про останню подію
    // вирішивши конфлікт обіцянки, дозволяючи клієнту продовжити
    const resolveValue =
      lastEventValue?.data.output || lastEventValue?.data.chunk?.data?.output;
    resolve(resolveValue);

    // закриваємо всі текстові потоки
    Object.values(callbacks).forEach((cb) => cb.done()); 

    // завершуємо основний потік UI
    ui.done(); 
  })();

  // повертаємо потік UI та останню подію
  return { ui: ui.value, lastEvent }; 
}


/*
    для майбутньої функції Promise.withResolvers, 
    тобто тимчасове рішення для функціоналу
*/
export function withResolvers<T>() {
  let resolve: (value: T) => void;     // вирішити
  let reject: (reason?: any) => void;  // відхилити

  // створюємо проміс (об'єкт js, який допомагає керувати асинхронними операціями
  // він дає "обіцянку" повернути результат пізніше: або успішно, або з помилкою)
  const innerPromise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  // Повертаємо масив із проміс та методів
  // @ts-expect-error - використовується для приглушення помилки TypeScript, яка може виникати через специфіку ініціалізації змінних
  return [innerPromise, resolve, reject] as const;
}


/*
    створення "центру" доступу до функцій, щоб вкладені компоненти могли їх викликати, 
                                           навіть якщо вони розташовані далеко у структурі додатку
*/
/**
 * @param actions - об'єкт з функціями для експортованих дій
 */

// отримує дії, які хочемо використовувати
export function exposeEndpoints<T extends Record<string, unknown>>(
  actions: T,
): {
  (props: { children: ReactNode }): Promise<JSX.Element>;
  $$types?: T; 
} {
  // повертає компонент, який обгортає дочірні елементи (children) у 
  // спеціальний контекст AIProvider, а цей контекст вже надає доступ всім
  return async function AI(props: { children: ReactNode }) {
    return <AIProvider actions={actions}>{props.children}</AIProvider>;
  };
}
