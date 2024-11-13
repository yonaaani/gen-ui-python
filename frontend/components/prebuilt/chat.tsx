// сам компонент для чату

"use client"; 

import { useState } from "react"; 
import { Input } from "../ui/input"; 
import { Button } from "../ui/button"; 
import { EndpointsContext } from "@/app/agent"; 
import { useActions } from "@/utils/client"; 
import { LocalContext } from "@/app/shared"; 
import { RemoteRunnable } from "@langchain/core/runnables/remote"; 
import { Github, GithubLoading } from "./github"; 
import { Invoice, InvoiceLoading } from "./invoice"; 
import { CurrentWeather, CurrentWeatherLoading } from "./weather"; 
import { createStreamableUI, createStreamableValue } from "ai/rsc"; 
import { StreamEvent } from "@langchain/core/tracers/log_stream"; 
import { AIMessage } from "@/ai/message"; 
import { HumanMessageText } from "./message"; 

// інтерфейс для пропсів компонента Chat
export interface ChatProps {}

// функція для перетворення файлу в формат base64
function convertFileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); // Створюємо читач для файлів
    reader.onload = () => {
      const base64String = reader.result as string; // Отримуємо результат читання файлу
      resolve(base64String.split(",")[1]); // Видаляємо префікс data URL і повертаємо чистий base64
    };
    reader.onerror = (error) => {
      reject(error); // Якщо сталася помилка при читанні, відхиляємо проміс
    };
    reader.readAsDataURL(file); // Читаємо файл як Data URL
  });
}

// Компонент для відображення повідомлення про завантаження файлу
function FileUploadMessage({ file }: { file: File }) {
  return (
    <div className="flex w-full max-w-fit ml-auto">
      <p>File uploaded: {file.name}</p> {/* Відображаємо ім'я завантаженого файлу */}
    </div>
  );
}

// Основний компонент чату
export default function Chat() {
  const actions = useActions<typeof EndpointsContext>(); // Отримуємо функції для виклику API через контекст

  const [elements, setElements] = useState<JSX.Element[]>([]); // Стан для збереження елементів чату
  const [history, setHistory] = useState<[role: string, content: string][]>([]); // Історія чату
  const [input, setInput] = useState(""); // Стан для введеного тексту
  const [selectedFile, setSelectedFile] = useState<File>(); // Стан для збереження вибраного файлу

  // Функція для обробки відправленого тексту
  async function onSubmit(input: string) {
    const newElements = [...elements]; // Копіюємо поточні елементи чату
    let base64File: string | undefined = undefined;
    let fileExtension = selectedFile?.type.split("/")[1]; // Отримуємо розширення файлу
    if (selectedFile) {
      base64File = await convertFileToBase64(selectedFile); // Перетворюємо файл у формат base64
    }

    // Викликаємо функцію агенту для обробки вводу
    const element = await actions.agent({
      input,
      chat_history: history, // Передаємо історію чату
      file:
        base64File && fileExtension
          ? {
              base64: base64File, // Передаємо перетворений файл
              extension: fileExtension, // І розширення
            }
          : undefined, // Якщо файлу немає, передаємо undefined
    });

    // Додаємо нові елементи до чату
    newElements.push(
      <div className="flex flex-col w-full gap-1 mt-auto" key={history.length}>
        {selectedFile && <FileUploadMessage file={selectedFile} />} {/* Якщо файл вибрано, відображаємо повідомлення */}
        <HumanMessageText content={input} /> {/* Виводимо повідомлення людини */}
        <div className="flex flex-col gap-1 w-full max-w-fit mr-auto">
          {element.ui} {/* Виводимо UI елемент для відповіді AI */}
        </div>
      </div>,
    );

    // Отримуємо результат з потоку подій і оновлюємо історію чату
    (async () => {
      let lastEvent = await element.lastEvent;
      if (Array.isArray(lastEvent)) {
        if (lastEvent[0].invoke_model && lastEvent[0].invoke_model.result) {
          setHistory((prev) => [
            ...prev,
            ["human", input],
            ["ai", lastEvent[0].invoke_model.result], // Додаємо результат моделі в історію
          ]);
        } else if (lastEvent[1].invoke_tools) {
          setHistory((prev) => [
            ...prev,
            ["human", input],
            [
              "ai",
              `Tool result: ${JSON.stringify(lastEvent[1].invoke_tools.tool_result, null)}`,
            ], // Якщо є виклик інструмента, додаємо результат інструмента
          ]);
        } else {
          setHistory((prev) => [...prev, ["human", input]]); // Якщо результат відсутній, просто додаємо ввід
        }
      } else if (lastEvent.invoke_model && lastEvent.invoke_model.result) {
        setHistory((prev) => [
          ...prev,
          ["human", input],
          ["ai", lastEvent.invoke_model.result], // Додаємо результат моделі в історію
        ]);
      }
    })();

    setElements(newElements); // Оновлюємо елементи чату
    setInput(""); // Очищаємо введене значення
    setSelectedFile(undefined); // Скидаємо вибраний файл
  }

  return (
    <div className="w-[70vw] overflow-y-scroll h-[80vh] flex flex-col gap-4 mx-auto border-[1px] border-gray-200 rounded-lg p-3 shadow-sm bg-gray-50/25">
      <LocalContext.Provider value={onSubmit}> {/* Передаємо функцію onSubmit в контекст */}
        <div className="flex flex-col w-full gap-1 mt-auto">{elements}</div> {/* Виводимо елементи чату */}
      </LocalContext.Provider>
      <form
        onSubmit={async (e) => {
          e.stopPropagation();
          e.preventDefault();
          await onSubmit(input); // Обробка відправлення форми
        }}
        className="w-full flex flex-row gap-2"
      >
        <Input
          placeholder="What's the weather like in San Francisco?" // Текст для підказки у полі вводу
          value={input} // Значення поля вводу
          onChange={(e) => setInput(e.target.value)} // Оновлення введеного тексту
        />
        <div className="w-[300px]">
          <Input
            placeholder="Upload" // Підказка для завантаження файлів
            id="image"
            type="file"
            accept="image/*"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                setSelectedFile(e.target.files[0]); // Оновлюємо вибраний файл
              }
            }}
          />
        </div>
        <Button type="submit">Submit</Button> {/* Кнопка для відправлення */}
      </form>
    </div>
  );
}
