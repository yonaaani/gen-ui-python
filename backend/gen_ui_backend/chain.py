from typing import List, Optional, TypedDict

from langchain.output_parsers.openai_tools import JsonOutputToolsParser
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.graph.graph import CompiledGraph

from gen_ui_backend.tools.github import github_repo
from gen_ui_backend.tools.invoice import invoice_parser
from gen_ui_backend.tools.weather import weather_data

# визначаємо структуру стану для процесу
class GenerativeUIState(TypedDict, total=False):
    input: HumanMessage  # вхідне повідомлення від користувача

    # Optional - значення може бути, а може й ні
    result: Optional[str]  # просто текстова відповідь
    tool_calls: Optional[List[dict]]  # список викликів інструментів
    tool_result: Optional[dict]  # оезультат після використання інструменту


# функція для обробки моделі
def invoke_model(state: GenerativeUIState, config: RunnableConfig) -> GenerativeUIState:
   
    # парсер для інструментів, який допоможе обробити відповіді
    tools_parser = JsonOutputToolsParser()
    
    # початковий шаблон для створення підказки для моделі
    initial_prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are a helpful assistant. You're provided a list of tools, and an input from the user.\n"
                + "Your job is to determine whether or not you have a tool which can handle the users input, or respond with plain text.",
            ),
            MessagesPlaceholder("input"),
        ]
    )
    
    # використовую LLM модель GPT-4 для обробки запитів
    model = ChatOpenAI(model="gpt-4o-mini", temperature=0, streaming=True)
    
    # Перелік доступних інструментів: 
    tools = [github_repo, invoice_parser, weather_data]
    
    # зв'язую модель з інструментами для інтеграції
    model_with_tools = model.bind_tools(tools)
    
    # створюю ланцюжок з початкового шаблону і моделі з інструментами
    chain = initial_prompt | model_with_tools
    
    # викликаю ланцюжок для обробки вхідного запиту
    result = chain.invoke({"input": state["input"]}, config)

    # перевіряю, чи отриманий результат є AI повідомленням
    if not isinstance(result, AIMessage):
        raise ValueError("Invalid result from model. Expected AIMessage.")

    # якщо модель викликала інструмент(и), обробляю їх за допомогою парсера
    if isinstance(result.tool_calls, list) and len(result.tool_calls) > 0:
        parsed_tools = tools_parser.invoke(result, config)
        return {"tool_calls": parsed_tools}
    else:
        # якщо інструменти не були викликані, повертаємо результат як текст
        return {"result": str(result.content)}
    

# функція для вибору подальшого кроку(тулу) в залежності від стану
def invoke_tools_or_return(state: GenerativeUIState) -> str:
    if "result" in state and isinstance(state["result"], str):
        return END  # якщо є текстовий результат, завершуємо процес
    elif "tool_calls" in state and isinstance(state["tool_calls"], list):
        return "invoke_tools"  # якщо є виклики інструментів, виконуємо їх
    else:
        raise ValueError("Invalid state. No result or tool calls found.")


# функція для виклику відповідного інструменту в залежності від запиту
def invoke_tools(state: GenerativeUIState) -> GenerativeUIState:

    # визначаю інструменти
    tools_map = {
        "github-repo": github_repo,
        "invoice-parser": invoice_parser,
        "weather-data": weather_data,
    }

    # якщо є любі виклики інструментів, виконуюються
    if state["tool_calls"] is not None:
        tool = state["tool_calls"][0]
        selected_tool = tools_map[tool["type"]]
        return {"tool_result": selected_tool.invoke(tool["args"])}
    else:
        raise ValueError("No tool calls found in state.")


# створюю граф станів для організації виконання процесу
def create_graph() -> CompiledGraph:
    workflow = StateGraph(GenerativeUIState)

    # додаю вузли графу для виклику моделі та інструментів
    workflow.add_node("invoke_model", invoke_model)  # type: ignore
    workflow.add_node("invoke_tools", invoke_tools)
    
    # "conditional edge" !!!
    # додаю умовні переходи між вузлами
    workflow.add_conditional_edges("invoke_model", invoke_tools_or_return) # сама умова
    workflow.set_entry_point("invoke_model")  # встановлюю початкову точку графу
    workflow.set_finish_point("invoke_tools")  # встановлюю кінцеву точку графу

    # компіліруємо граф
    graph = workflow.compile()
    return graph