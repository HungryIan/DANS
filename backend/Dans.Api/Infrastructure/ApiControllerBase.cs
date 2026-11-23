using Dans.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace Dans.Api.Infrastructure;

/// <summary>Base class for all API controllers. Errors are returned as RFC 7807 problem details
/// whose "detail" field holds a message that can be shown to the user.</summary>
[ApiController]
public abstract class ApiControllerBase : ControllerBase
{
    protected int CurrentUserId => User.GetUserId();

    protected UserRole CurrentRole => User.GetRole();

    protected ObjectResult Error(int statusCode, string message) => Problem(detail: message, statusCode: statusCode);
}
