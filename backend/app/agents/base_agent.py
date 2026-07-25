import asyncio
from typing import Any, Dict

class A2AMessage:
    def __init__(self, sender: str, receiver: str, payload: Dict[str, Any]):
        self.sender = sender
        self.receiver = receiver
        self.payload = payload

class ADKAgent:
    def __init__(self, name: str):
        self.name = name

    async def send_message(self, receiver_agent: 'ADKAgent', payload: Dict[str, Any]) -> Dict[str, Any]:
        """Simulates sending an A2A message to another agent"""
        msg = A2AMessage(sender=self.name, receiver=receiver_agent.name, payload=payload)
        return await receiver_agent.process_message(msg)

    async def process_message(self, message: A2AMessage) -> Dict[str, Any]:
        """To be overridden by subclasses"""
        raise NotImplementedError
