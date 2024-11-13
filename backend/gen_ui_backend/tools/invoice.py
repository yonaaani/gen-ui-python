# інструмент для оброки рахунку

from typing import List, Optional
from uuid import uuid4

from langchain.pydantic_v1 import BaseModel, Field
from langchain_core.tools import tool


# описує окремий товар в інвойсі (пункт замовлення)
class LineItem(BaseModel):
    id: str = Field(
        default_factory=uuid4, description="Unique identifier for the line item"  # унікальний ідентифікатор для пункту
    )
    name: str = Field(..., description="Name or description of the line item")  # назва або опис товару
    quantity: int = Field(..., gt=0, description="Quantity of the line item")  # кількість товару, повинна бути більше нуля
    price: float = Field(..., gt=0, description="Price per unit of the line item")  # ціна за одиницю товару, більше нуля


# описує адресу доставки замовлення
class ShippingAddress(BaseModel):
    name: str = Field(..., description="Name of the recipient")  # ім'я одержувача
    street: str = Field(..., description="Street address for shipping")  # адреса вулиці для доставки
    city: str = Field(..., description="City for shipping")  # місто для доставки
    state: str = Field(..., description="State or province for shipping")  # область або провінція для доставки
    zip: str = Field(..., description="ZIP or postal code for shipping")  # поштовий код для доставки


# описує інформацію про клієнта
class CustomerInfo(BaseModel):
    name: str = Field(..., description="Name of the customer")  # ім'я клієнта
    email: str = Field(..., description="Email address of the customer")  # електронна пошта клієнта
    phone: Optional[str] = Field(None, description="Phone number of the customer")  # номер телефону клієнта (необов'язковий)


# описує інформацію про платіж
class PaymentInfo(BaseModel):
    cardType: str = Field(..., description="Type of credit card used for payment")  # тип кредитної картки
    cardNumberLastFour: str = Field(
        ..., description="Last four digits of the credit card number"  # останні чотири цифри номеру кредитної картки
    )


# описує весь інвойс із деталями замовлення, доставки, клієнта та платежу
class Invoice(BaseModel):
    """Parse an invoice and return its values. This tool should ALWAYS be called if an image is provided."""

    orderId: str = Field(..., description="The order ID")  # ідентифікатор замовлення
    lineItems: List[LineItem] = Field(
        ..., description="List of line items in the invoice"  # список товарів в інвойсі
    )
    shippingAddress: Optional[ShippingAddress] = Field(
        None, description="Shipping address for the order"  # адреса доставки для замовлення
    )
    customerInfo: Optional[CustomerInfo] = Field(
        None, description="Information about the customer"  # інформація про клієнта
    )
    paymentInfo: Optional[PaymentInfo] = Field(
        None, description="Payment information for the order"  # інформація про платіж для замовлення
    )


# інструмент для обробки інвойсу: приймає дані інвойсу, повертає його без змін
@tool("invoice-parser", args_schema=Invoice, return_direct=True)
def invoice_parser(
    orderId: str,
    lineItems: List[LineItem],
    shippingAddress: Optional[ShippingAddress],
    customerInfo: Optional[CustomerInfo],
    paymentInfo: Optional[PaymentInfo],
) -> Invoice:
    """Parse an invoice and return it without modification."""
    return Invoice(
        orderId=orderId,
        lineItems=lineItems,
        shippingAddress=shippingAddress,
        customerInfo=customerInfo,
        paymentInfo=paymentInfo,
    )
