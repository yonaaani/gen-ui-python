"use client";

import { ReactNode, useContext } from "react";
import { createContext } from "react";

// створюємо контекст, який виступаї як "глобальне сховище" для функцій-actions
const ActionsContext = createContext<any>(null);

/*
  Внутрішній постачальник, що розкриває серіалізовані дії React - передача даних між сервером і клієнтом
  Це потрібно врахувати в схемі маршруту
*/
export const AIProvider = (props: {
  actions: Record<string, any>;
  children: ReactNode;
}) => {
  return (
    <ActionsContext.Provider value={props.actions}>
      {props.children}
    </ActionsContext.Provider>
  );
};

/*
  Функція useActions повертає об'єкт з функціями з контексту, 
  типізуючи його згідно з переданим параметром T

  Це дає змогу працювати з actions, гарантуючи, що вони мають правильний тип, 
  і виключає undefined з можливих значень
*/
export function useActions<T extends { $$types?: Record<string, unknown> }>() {
  return useContext(ActionsContext) as Exclude<T["$$types"], undefined>;
}
