"""Adapters require an already running, locally configured model service."""
from . import vllm, llamacpp, sglang, openvino
ADAPTERS = {m.__name__.rsplit('.', 1)[-1]: m for m in (vllm, llamacpp, sglang, openvino)}
