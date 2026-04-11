#!/usr/bin/env python3
"""Publish one QuizPlus carousel from OpenClaw cron.

This is intentionally shaped like the TableLite cron helper: load env, open the
required password-based SSH tunnel, call private QuizPlus endpoints, publish.
The VPS app owns quiz selection, image rendering, Publer uploads, and history.
"""

from __future__ import annotations

import argparse
import fcntl
import http.client
import io
import json
import os
import socket
import ssl
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib import error, parse

DEFAULT_BASE_URL = "https://quizplus.io"
DEFAULT_PIPELINE = "organic_publer_main"
RESERVE_PATH = "/api/internal/social/reserve-next"
PUBLISH_PATH = "/api/internal/social/publish"


def env_flag(name: str) -> bool:
    value = os.getenv(name)
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str) -> int | None:
    value = os.getenv(name)
    if value is None:
        return None
    trimmed = value.strip()
    return int(trimmed) if trimmed else None


def load_dotenv(path: str = ".env.openclaw") -> None:
    env_path = Path(path)
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and (
            (value[0] == '"' and value[-1] == '"')
            or (value[0] == "'" and value[-1] == "'")
        ):
            value = value[1:-1]

        os.environ.setdefault(key, value)


def pick_free_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as handle:
        handle.bind(("127.0.0.1", 0))
        return int(handle.getsockname()[1])


def replace_url_port(url: str, port: int) -> str:
    parsed_url = parse.urlparse(url)
    hostname = parsed_url.hostname
    if not hostname:
        raise ValueError(f"Invalid URL: {url}")

    netloc = f"[{hostname}]:{port}" if ":" in hostname else f"{hostname}:{port}"
    return parse.urlunparse(parsed_url._replace(netloc=netloc))


class ProcessLock:
    def __init__(self, path: str) -> None:
        self.path = Path(path)
        self._handle: Any | None = None

    def __enter__(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._handle = self.path.open("w", encoding="utf-8")
        try:
            fcntl.flock(self._handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError(f"Another QuizPlus social publish is already running: {self.path}")
        self._handle.write(f"{os.getpid()}\n")
        self._handle.flush()

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._handle:
            fcntl.flock(self._handle.fileno(), fcntl.LOCK_UN)
            self._handle.close()
            self._handle = None


class SSHTunnel:
    def __init__(
        self,
        *,
        host: str,
        user: str,
        password: str,
        remote_host: str,
        remote_port: int,
        local_port: int | None,
        ssh_port: int,
    ) -> None:
        self.host = host
        self.user = user
        self.password = password
        self.remote_host = remote_host
        self.remote_port = remote_port
        self.local_port = local_port or pick_free_local_port()
        self.ssh_port = ssh_port
        self._process: subprocess.Popen[str] | None = None
        self._askpass_path: str | None = None

    def __enter__(self) -> int:
        try:
            with tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8") as handle:
                handle.write("#!/bin/sh\n")
                handle.write("printf '%s\\n' \"$QUIZPLUS_SOCIAL_SSH_PASSWORD_ASKPASS\"\n")
                self._askpass_path = handle.name

            os.chmod(self._askpass_path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)

            env = os.environ.copy()
            env["QUIZPLUS_SOCIAL_SSH_PASSWORD_ASKPASS"] = self.password
            env["SSH_ASKPASS"] = self._askpass_path
            env["SSH_ASKPASS_REQUIRE"] = "force"
            env["DISPLAY"] = env.get("DISPLAY") or "quizplus-ssh-askpass"

            command = [
                "ssh",
                "-p",
                str(self.ssh_port),
                "-o",
                "BatchMode=no",
                "-o",
                "PreferredAuthentications=password,keyboard-interactive",
                "-o",
                "PubkeyAuthentication=no",
                "-o",
                "StrictHostKeyChecking=accept-new",
                "-o",
                "ExitOnForwardFailure=yes",
                "-o",
                "ServerAliveInterval=30",
                "-o",
                "ServerAliveCountMax=3",
                "-N",
                "-L",
                f"{self.local_port}:{self.remote_host}:{self.remote_port}",
                f"{self.user}@{self.host}",
            ]

            self._process = subprocess.Popen(
                command,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=env,
            )

            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                if self._process.poll() is not None:
                    stderr_output = self._process.stderr.read().strip() if self._process.stderr else ""
                    raise RuntimeError(f"SSH tunnel failed: {stderr_output or 'ssh exited unexpectedly'}")

                try:
                    with socket.create_connection(("127.0.0.1", self.local_port), timeout=0.2):
                        return self.local_port
                except OSError:
                    time.sleep(0.2)

            raise RuntimeError("SSH tunnel did not become ready before timeout.")
        except Exception:
            self.close()
            raise

    def close(self) -> None:
        if self._process:
            if self._process.poll() is None:
                self._process.terminate()
                try:
                    self._process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self._process.kill()
                    self._process.wait(timeout=5)
            self._process = None

        if self._askpass_path:
            try:
                os.unlink(self._askpass_path)
            except FileNotFoundError:
                pass
            self._askpass_path = None

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()


class DirectHTTPConnection(http.client.HTTPConnection):
    def __init__(self, *, connect_host: str, request_host: str, **kwargs: Any) -> None:
        self._connect_host = connect_host
        super().__init__(host=request_host, **kwargs)

    def connect(self) -> None:
        self.sock = socket.create_connection((self._connect_host, self.port), self.timeout, self.source_address)


class DirectHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, *, connect_host: str, request_host: str, context: ssl.SSLContext, **kwargs: Any) -> None:
        self._connect_host = connect_host
        self._request_host = request_host
        super().__init__(host=request_host, context=context, **kwargs)

    def connect(self) -> None:
        sock = socket.create_connection((self._connect_host, self.port), self.timeout, self.source_address)
        server_hostname = self._tunnel_host or self._request_host
        self.sock = self._context.wrap_socket(sock, server_hostname=server_hostname)


def endpoint_url(base_url: str, path: str) -> str:
    return parse.urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))


def read_json(raw_body: bytes) -> dict[str, Any]:
    if not raw_body:
        return {}
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError:
        return {"raw": raw_body.decode("utf-8", errors="replace")}
    return payload if isinstance(payload, dict) else {"data": payload}


def request_json(
    *,
    method: str,
    url: str,
    secret: str,
    payload: dict[str, Any] | None,
    connect_ip: str,
    insecure_tls: bool,
    timeout: int,
) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Authorization": f"Bearer {secret}",
        "Accept": "application/json",
        "Host": parse.urlparse(url).hostname or "",
        "User-Agent": "QuizPlus-OpenClaw-Social/1.0",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"

    parsed_url = parse.urlparse(url)
    scheme = parsed_url.scheme.lower()
    request_host = parsed_url.hostname
    if not request_host:
        raise ValueError(f"Invalid request URL: {url}")

    request_path = parsed_url.path or "/"
    if parsed_url.query:
        request_path = f"{request_path}?{parsed_url.query}"

    if scheme == "https":
        context = ssl._create_unverified_context() if insecure_tls else ssl.create_default_context()
        connection: http.client.HTTPConnection = DirectHTTPSConnection(
            connect_host=connect_ip,
            request_host=request_host,
            port=parsed_url.port or 443,
            timeout=timeout,
            context=context,
        )
    elif scheme == "http":
        connection = DirectHTTPConnection(
            connect_host=connect_ip,
            request_host=request_host,
            port=parsed_url.port or 80,
            timeout=timeout,
        )
    else:
        raise ValueError(f"Unsupported URL scheme: {scheme}")

    try:
        connection.request(method, request_path, body=body, headers=headers)
        response = connection.getresponse()
        raw_body = response.read()
        if response.status >= 400:
            raise error.HTTPError(url, response.status, response.reason, response.headers, io.BytesIO(raw_body))
        return read_json(raw_body)
    finally:
        connection.close()


def clean_text(value: Any, fallback: str = "") -> str:
    if not isinstance(value, str):
        return fallback
    return " ".join(value.split()).strip() or fallback


def clip_text(value: str, limit: int) -> str:
    normalized = clean_text(value)
    if len(normalized) <= limit:
        return normalized

    trimmed = normalized[: max(0, limit - 3)].rstrip()
    if " " in trimmed:
        trimmed = trimmed.rsplit(" ", 1)[0]
    return f"{trimmed}..."


def plural(count: int, singular: str) -> str:
    return singular if count == 1 else f"{singular}s"


def build_caption(snapshot: dict[str, Any], audience: str, play_url: str) -> str:
    title = clean_text(snapshot.get("title"), "QuizPlus trivia")
    game_mode = clean_text(snapshot.get("gameMode"), "single")
    selected_count = int(snapshot.get("selectedQuestionCount") or 0)
    answered_count = max(0, selected_count - 1)

    opener = {
        "us": "US evening quiz drop",
        "india": "India evening quiz drop",
    }.get(audience, "Tonight's QuizPlus challenge")

    hashtags = {
        "us": "#QuizPlus #TriviaNight #FamilyGameNight #GameNight",
        "india": "#QuizPlus #QuizTime #FamilyGameNight #Trivia",
    }.get(audience, "#QuizPlus #Trivia #FamilyGameNight #QuizTime")

    if game_mode == "wwtbam":
        challenge = f"{answered_count} {plural(answered_count, 'answer')} locked in. Can you climb the ladder?"
    else:
        challenge = f"{answered_count} correct {plural(answered_count, 'answer')} revealed. Can you finish the round?"

    return "\n\n".join(
        [
            f"{opener}: {title}",
            challenge,
            f"Play the full quiz: {play_url}",
            hashtags,
        ],
    )


def build_tiktok_title(snapshot: dict[str, Any]) -> str:
    title = clean_text(snapshot.get("title"))
    return clip_text(f"Can you finish this QuizPlus quiz? {title}", 90) if title else "Can you finish this QuizPlus quiz?"


def parse_args() -> argparse.Namespace:
    load_dotenv()

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audience", choices=["us", "india", "global"], default=os.getenv("QUIZPLUS_SOCIAL_AUDIENCE", "global"))
    parser.add_argument("--base-url", default=os.getenv("QUIZPLUS_SOCIAL_BASE_URL", DEFAULT_BASE_URL), help="QuizPlus base URL, for example https://quizplus.io")
    parser.add_argument("--pipeline", default=os.getenv("QUIZPLUS_SOCIAL_PIPELINE_SLUG", DEFAULT_PIPELINE))
    parser.add_argument("--quiz-id", default=os.getenv("QUIZPLUS_SOCIAL_QUIZ_ID"), help="Optional exact quiz UUID for a one-off test")
    parser.add_argument("--secret", default=os.getenv("CRON_SECRET"), help="Bearer secret for internal social endpoints")
    parser.add_argument("--ssh-host", default=os.getenv("QUIZPLUS_SOCIAL_SSH_HOST"), required=os.getenv("QUIZPLUS_SOCIAL_SSH_HOST") is None)
    parser.add_argument("--ssh-user", default=os.getenv("QUIZPLUS_SOCIAL_SSH_USER"), required=os.getenv("QUIZPLUS_SOCIAL_SSH_USER") is None)
    parser.add_argument("--ssh-password", default=os.getenv("QUIZPLUS_SOCIAL_SSH_PASSWORD"), required=os.getenv("QUIZPLUS_SOCIAL_SSH_PASSWORD") is None)
    parser.add_argument("--ssh-port", type=int, default=env_int("QUIZPLUS_SOCIAL_SSH_PORT") or 22)
    parser.add_argument("--ssh-local-port", type=int, default=env_int("QUIZPLUS_SOCIAL_SSH_LOCAL_PORT"))
    parser.add_argument("--ssh-remote-host", default=os.getenv("QUIZPLUS_SOCIAL_SSH_REMOTE_HOST", "127.0.0.1"))
    parser.add_argument("--ssh-remote-port", type=int, default=env_int("QUIZPLUS_SOCIAL_SSH_REMOTE_PORT") or 443)
    parser.add_argument("--insecure-tls", action="store_true", default=env_flag("QUIZPLUS_SOCIAL_INSECURE_TLS"))
    parser.add_argument("--timeout", type=int, default=env_int("QUIZPLUS_SOCIAL_TIMEOUT_SECONDS") or 120)
    parser.add_argument("--lock-file", default=os.getenv("QUIZPLUS_SOCIAL_LOCK_FILE", "/tmp/quizplus-social.lock"))
    parser.add_argument("--print-json", action="store_true", default=env_flag("QUIZPLUS_SOCIAL_PRINT_JSON"))
    return parser.parse_args()


def run(args: argparse.Namespace) -> int:
    if not args.secret:
        print("Missing CRON_SECRET or --secret.", file=sys.stderr)
        return 1

    public_base_url = args.base_url.rstrip("/")
    tunnel: SSHTunnel | None = None

    try:
        tunnel = SSHTunnel(
            host=args.ssh_host,
            user=args.ssh_user,
            password=args.ssh_password,
            remote_host=args.ssh_remote_host,
            remote_port=args.ssh_remote_port,
            local_port=args.ssh_local_port,
            ssh_port=args.ssh_port,
        )
        local_port = tunnel.__enter__()
        tunneled_base_url = replace_url_port(public_base_url, local_port)

        reserve_payload: dict[str, Any] = {
            "pipelineSlug": args.pipeline,
            "baseUrl": public_base_url,
        }
        if args.quiz_id:
            reserve_payload["quizId"] = args.quiz_id

        reserve_result = request_json(
            method="POST",
            url=endpoint_url(tunneled_base_url, RESERVE_PATH),
            secret=args.secret,
            payload=reserve_payload,
            connect_ip="127.0.0.1",
            insecure_tls=args.insecure_tls,
            timeout=args.timeout,
        )

        if reserve_result.get("status") == "empty":
            message = {
                "status": "empty",
                "pipeline": reserve_result.get("pipeline"),
                "remainingEligible": reserve_result.get("remainingEligible"),
                "nudge": reserve_result.get("nudge"),
            }
            print(json.dumps(message, indent=2, sort_keys=True) if args.print_json else "No eligible public QuizPlus quizzes remain.")
            return 0

        if reserve_result.get("status") != "ok" or not isinstance(reserve_result.get("socialPost"), dict):
            print(f"Unexpected reserve response: {json.dumps(reserve_result)}", file=sys.stderr)
            return 1

        social_post = reserve_result["socialPost"]
        snapshot = social_post.get("quizSnapshot")
        if not isinstance(snapshot, dict):
            print(f"Reserve response did not include quizSnapshot: {json.dumps(reserve_result)}", file=sys.stderr)
            return 1

        social_post_id = clean_text(social_post.get("id"))
        play_url = clean_text(social_post.get("playUrl")) or clean_text(snapshot.get("playUrl"))
        if not social_post_id or not play_url:
            print(f"Reserve response is missing socialPost.id or playUrl: {json.dumps(reserve_result)}", file=sys.stderr)
            return 1

        publish_result = request_json(
            method="POST",
            url=endpoint_url(tunneled_base_url, PUBLISH_PATH),
            secret=args.secret,
            payload={
                "socialPostId": social_post_id,
                "caption": build_caption(snapshot, args.audience, play_url),
                "firstComment": None,
                "tiktokTitle": build_tiktok_title(snapshot),
                "publishMode": "publish",
            },
            connect_ip="127.0.0.1",
            insecure_tls=args.insecure_tls,
            timeout=args.timeout,
        )

        result = {
            "status": "published",
            "audience": args.audience,
            "socialPostId": social_post_id,
            "quizId": clean_text(snapshot.get("quizId")),
            "quizTitle": clean_text(snapshot.get("title")),
            "gameMode": clean_text(snapshot.get("gameMode")),
            "playUrl": play_url,
            "reviewUrl": social_post.get("reviewUrl"),
            "remainingEligibleBeforeReservation": reserve_result.get("remainingEligible"),
            "nudge": reserve_result.get("nudge"),
            "publish": publish_result,
        }

        if args.print_json:
            print(json.dumps(result, indent=2, sort_keys=True))
        else:
            print(f"Published QuizPlus carousel for {args.audience}.")
            print(f"Social post: {social_post_id}")
            print(f"Quiz: {result['quizTitle']}")
            print(f"Mode: {result['gameMode']}")
            print(f"Play URL: {play_url}")
            print(f"Review URL: {result['reviewUrl']}")
            publer = publish_result.get("publer")
            if isinstance(publer, dict) and publer.get("jobId"):
                print(f"Publer job: {publer['jobId']}")
            if result["nudge"]:
                print(f"Nudge: {json.dumps(result['nudge'])}")

        return 0
    except error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        print(f"QuizPlus social publish failed with HTTP {exc.code}: {exc.reason}", file=sys.stderr)
        if details:
            print(details, file=sys.stderr)
        return 1
    except Exception as exc:
        if str(exc).startswith("Another QuizPlus social publish"):
            print(str(exc))
            return 0
        print(f"QuizPlus social publish failed: {exc}", file=sys.stderr)
        return 1
    finally:
        if tunnel is not None:
            tunnel.__exit__(None, None, None)


def main() -> int:
    args = parse_args()
    try:
        with ProcessLock(args.lock_file):
            return run(args)
    except RuntimeError as exc:
        if str(exc).startswith("Another QuizPlus social publish"):
            print(str(exc))
            return 0
        raise


if __name__ == "__main__":
    raise SystemExit(main())
