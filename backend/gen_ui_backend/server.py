import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langserve import add_routes

from gen_ui_backend.chain import create_graph  #  імпорт функції для створення об'єкта "графа" (робочого процесу)
from gen_ui_backend.types import ChatInputType  # імпорт типу вхідних даних для чату

# завантажую змінні середовища з файлу .env
load_dotenv()


def start() -> None:

    # ініціалізую об'єкт FastAPI, що буде сервером для нашого API
    app = FastAPI(
        title="Gen UI Backend",  
        version="1.0", 
        description="A simple api server using Langchain's Runnable interfaces",  # Опис API
    )

    # налаштування CORS (доступу з різних доменів)
    origins = [
        "http://localhost",  # дозволений доступ з localhost
        "http://localhost:3000",  # дозволений доступ з localhost на порті 3000
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,  # дозволяю вказані домени
        allow_credentials=True,  # дозволяю надсилати облікові дані (наприклад, файли cookie)
        allow_methods=["*"],  # дозволяю всі HTTP методи (GET, POST і т.д.)
        allow_headers=["*"],  # дозволяю всі заголовки
    )

    # cтворюю "граф" (робочий процес) для обробки вхідних даних
    graph = create_graph()

    # налаштовую граф на обробку даних з вказаним типом вхідних (ChatInputType) та вихідних (dict) даних
    runnable = graph.with_types(input_type=ChatInputType, output_type=dict)

    # додаю маршрути до FastAPI для обробки запитів через /chat
    add_routes(app, runnable, path="/chat", playground_type="chat")

    # запуск сервера
    print("Starting server...")
    uvicorn.run(app, host="0.0.0.0", port=8000)  
