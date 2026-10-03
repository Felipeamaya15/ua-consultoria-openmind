class AuthException(Exception):
    """Excepción base para el módulo de autenticación."""
    pass

class InvalidCredentialsException(AuthException):
    pass

class UserAlreadyExistsException(AuthException):
    pass

class UserNotFoundException(AuthException):
    pass

class WeakPasswordException(AuthException):
    """Lanzada cuando la contraseña no cumple las reglas de complejidad."""
    pass