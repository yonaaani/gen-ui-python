# інструмент для обробки git-запиту

import os
from typing import Dict, Union

import requests
from langchain.pydantic_v1 import BaseModel, Field
from langchain_core.tools import tool


# клас для валідації введених даних про GitHub репозиторій
class GithubRepoInput(BaseModel):
    owner: str = Field(..., description="The name of the repository owner.") 
    repo: str = Field(..., description="The name of the repository.")  


# функція-інструмент для отримання інформації про GitHub репозиторій
@tool("github-repo", args_schema=GithubRepoInput, return_direct=True)
def github_repo(owner: str, repo: str) -> Union[Dict, str]:
    """Get information about a GitHub repository."""

    # перевірка, чи присутній токен доступу до GitHub API, щоб можна було тягнути з гітів
    if not os.environ.get("GITHUB_TOKEN"):
        raise ValueError("Missing GITHUB_TOKEN secret.")  # помилка, якщо токен відсутній

    # заголовки для авторизації та версії API при запиті до GitHub
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    # формування URL для запиту до GitHub API з використанням вказаного власника та репозиторію
    url = f"https://api.github.com/repos/{owner}/{repo}"

    try:
        # надсилання GET-запиту для отримання інформації про репозиторій
        response = requests.get(url, headers=headers)
        response.raise_for_status()  # перевірка на статус відповіді, якщо помилка - викликає виключення
        repo_data = response.json()  # перетворення відповіді у формат JSON

        # повернення основної інформації про репозиторій
        return {
            "owner": owner,
            "repo": repo,
            "description": repo_data.get("description", ""),  
            "stars": repo_data.get("stargazers_count", 0),  
            "language": repo_data.get("language", ""),  
        }
    except requests.exceptions.RequestException as err:

        # у випадку помилки виводить повідомлення, що не бачить репозиторій, щось неправильно введено
        print(err)
        return "There was an error fetching the repository. Please check the owner and repo names."
