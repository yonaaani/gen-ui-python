# інструмент для обробки погоди

import os
from typing import Optional

import requests
from langchain.pydantic_v1 import BaseModel, Field
from langchain_core.tools import tool


# описує вхідні дані для запиту погоди
class WeatherInput(BaseModel):
    city: str = Field(..., description="The city name to get weather for")  # назва міста для отримання погоди
    state: str = Field(
        ..., description="The two letter state abbreviation to get weather for"  # двобуквений код штату для отримання погоди
    )
    country: Optional[str] = Field(
        "ua", description="The two letter country abbreviation to get weather for"  # двобуквений код країни для отримання погоди, за замовчуванням - Україна
    )


# інструмент для отримання поточної температури в зазначеному місті
@tool("weather-data", args_schema=WeatherInput, return_direct=True)
def weather_data(city: str, state: str, country: str = "usa") -> dict:
    """Get the current temperature for a city."""
    
    # отримую ключ для геокодування (для визначення координат міста)
    geocode_api_key = os.environ.get("GEOCODE_API_KEY")
    if not geocode_api_key:
        raise ValueError("Missing GEOCODE_API_KEY secret.")  # перевірка, чи є ключ API для геокодування

    # формую URL для запиту геокодування, щоб отримати координати міста
    geocode_url = f"https://geocode.xyz/{city.lower()},{state.lower()},{country.lower()}?json=1&auth={geocode_api_key}"
    geocode_response = requests.get(geocode_url)
    if not geocode_response.ok:
        print("No geocode data found.")  # вивід повідомлення, якщо не знайдено дані для геокодування
        raise ValueError("Failed to get geocode data.")
    
    # отримую широту (latt) і довготу (longt) для міста
    geocode_data = geocode_response.json()
    latt = geocode_data["latt"]
    longt = geocode_data["longt"]

    # формую URL для запиту погоди за координатами з api.weather.gov
    weather_gov_url = f"https://api.weather.gov/points/{latt},{longt}"
    weather_gov_response = requests.get(weather_gov_url)
    if not weather_gov_response.ok:
        print("No weather data found.")  # Вивід повідомлення, якщо не знайдено дані про погоду
        raise ValueError("Failed to get weather data.")
    
    # отримую URL прогнозу погоди
    weather_gov_data = weather_gov_response.json()
    properties = weather_gov_data["properties"]
    forecast_url = properties["forecast"]

    # запитую прогноз погоди
    forecast_response = requests.get(forecast_url)
    if not forecast_response.ok:
        print("No forecast data found.")  # вивід повідомлення, якщо не знайдено дані про прогноз
        raise ValueError("Failed to get forecast data.")
    
    # отримую температуру з прогнозу погоди для поточного дня
    forecast_data = forecast_response.json()
    periods = forecast_data["properties"]["periods"]
    today_forecast = periods[0]

    # повертаю інформацію про місто, штат, країну і температуру
    return {
        "city": city,
        "state": state,
        "country": country,
        "temperature": today_forecast["temperature"],
    }
