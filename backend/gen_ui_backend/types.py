from typing import List, Union

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.pydantic_v1 import BaseModel

# chat history
# структура для зберігання списку повідомлень різних типів
class ChatInputType(BaseModel):

    # поле input може містити список повідомлень типів HumanMessage, AIMessage або SystemMessage
    input: List[Union[HumanMessage, AIMessage, SystemMessage]]
