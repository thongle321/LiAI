"""Calculate talent: safe arithmetic over an AST whitelist, never eval."""

import ast
import math
import operator

MAX_EXPR_LEN = 200
"""Expressions past this are rejected (context-budget guard, not security)."""

Number = int | float

_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

_FUNCS = {
    "abs": abs,
    "round": round,
    "min": min,
    "max": max,
    "sqrt": math.sqrt,
    "pow": pow,
}

_CONSTS = {"pi": math.pi, "e": math.e}


def _eval(node: ast.AST) -> Number:
    if isinstance(node, ast.Expression):
        return _eval(node.body)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise TypeError("only numbers allowed")
        return node.value
    if isinstance(node, ast.BinOp):
        op = _BINOPS.get(type(node.op))
        if op is None:
            raise ValueError("operator not allowed")
        return op(_eval(node.left), _eval(node.right))
    if isinstance(node, ast.UnaryOp):
        if not isinstance(node.op, (ast.UAdd, ast.USub)):
            raise TypeError("operator not allowed")
        value = _eval(node.operand)
        return value if isinstance(node.op, ast.UAdd) else -value
    if isinstance(node, ast.Name):
        if node.id not in _CONSTS:
            raise ValueError(f"unknown name: {node.id}")
        return _CONSTS[node.id]
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in _FUNCS:
            raise ValueError("function not allowed")
        if node.keywords:
            raise ValueError("keyword arguments not allowed")
        args = [_eval(arg) for arg in node.args]
        return _FUNCS[node.func.id](*args)
    raise ValueError(f"{type(node).__name__} not allowed")


def calculate(expression: str) -> str:
    """Evaluate arithmetic; anything else is a friendly string, never a raise.

    Tools must not raise (a raise becomes framework error machinery); the
    model reads the string and either retries or answers.
    """
    expr = expression.strip()
    if not expr:
        return "cannot evaluate '': expression is empty"
    if len(expr) > MAX_EXPR_LEN:
        return f"cannot evaluate {expr[:32]!r}...: expression too long"
    try:
        result = _eval(ast.parse(expr, mode="eval"))
    except ZeroDivisionError:
        return f"cannot evaluate {expr!r}: division by zero"
    except (SyntaxError, ValueError, TypeError) as exc:
        return f"cannot evaluate {expr!r}: {exc}"
    if isinstance(result, bool):
        return f"cannot evaluate {expr!r}: only numbers allowed"
    return str(result)
