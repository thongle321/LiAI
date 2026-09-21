import os
import urllib.request
from pathlib import Path

from pydantic_ai.providers.openai import OpenAIProvider

from .base import CachedChatModel, ProviderConfig, request_text


class LocalLlamaCppProvider(CachedChatModel):
    """Local GGUF model provider using llama-cpp-python with OpenAI-compatible API.
    
    This provider runs a llama-cpp-python server locally and connects to it
    via the OpenAI-compatible client. The server is started lazily on first use.
    """

    def __init__(
        self,
        model_path: str,
        model_name: str | None = None,
        n_ctx: int = 4096,
        n_gpu_layers: int = 0,
        n_threads: int | None = None,
        verbose: bool = False,
        host: str = "127.0.0.1",
        port: int = 8081,
    ) -> None:
        self.model_path = model_path
        self.model_name = model_name or Path(model_path).stem
        self.n_ctx = n_ctx
        self.n_gpu_layers = n_gpu_layers
        self.n_threads = n_threads or os.cpu_count()
        self.verbose = verbose
        self.host = host
        self.port = port
        self.base_url = f"http://{host}:{port}"
        self._server_process = None
        self._server_started = False
        self.provider_type = "local_gguf"

    def _prepare(self) -> None:
        self._ensure_server_running()

    def _provider(self) -> OpenAIProvider:
        return OpenAIProvider(base_url=f"{self.base_url}/v1", api_key="not-required")

    def _probe(self, timeout: float) -> bool:
        """True when the local server answers /health (stdlib, no extra dep)."""
        try:
            with urllib.request.urlopen(f"{self.base_url}/health", timeout=timeout) as response:
                return response.status == 200
        except Exception:
            return False

    def _ensure_server_running(self) -> None:
        """Start the llama-cpp-python server if not already running."""
        if self._server_started:
            return

        if self._probe(2):
            self._server_started = True
            return

        # Start the server as a subprocess
        self._start_server()
        self._wait_for_server()

    def _start_server(self) -> None:
        """Start the llama-cpp-python server subprocess."""
        import subprocess

        model_file = Path(self.model_path)
        if not model_file.exists():
            raise FileNotFoundError(f"Model file not found: {self.model_path}")

        cmd = [
            "python", "-m", "llama_cpp.server",
            "--model", str(model_file),
            "--host", self.host,
            "--port", str(self.port),
            "--n_ctx", str(self.n_ctx),
            "--n_gpu_layers", str(self.n_gpu_layers),
            "--n_threads", str(self.n_threads),
        ]

        if self.verbose:
            cmd.append("--verbose")

        self._server_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

    def _wait_for_server(self, timeout: float = 30.0) -> None:
        """Wait for the server to become ready."""
        import time

        start = time.time()
        while time.time() - start < timeout:
            if self._probe(1):
                self._server_started = True
                return
            time.sleep(0.5)

        # If we get here, server didn't start
        if self._server_process:
            stdout, stderr = self._server_process.communicate(timeout=5)
            raise RuntimeError(
                f"llama-cpp-python server failed to start. "
                f"stdout: {stdout.decode() if stdout else ''} "
                f"stderr: {stderr.decode() if stderr else ''}"
            )
        raise RuntimeError("llama-cpp-python server failed to start")

    async def reply(self, message: str) -> str:
        return await request_text(
            self._get_model(), message, empty_error="Local LlamaCpp provider returned no text"
        )

    def shutdown(self) -> None:
        """Shutdown the llama-cpp-python server."""
        if self._server_process:
            self._server_process.terminate()
            try:
                self._server_process.wait(timeout=5)
            except Exception:
                self._server_process.kill()
            self._server_process = None
            self._server_started = False

    @classmethod
    def from_config(cls, config: ProviderConfig) -> "LocalLlamaCppProvider":
        """Create provider from ProviderConfig."""
        return cls(
            model_path=config.model_path or "",
            model_name=config.model_name,
            n_ctx=config.n_ctx,
            n_gpu_layers=config.n_gpu_layers,
            n_threads=config.n_threads,
            verbose=config.verbose,
        )