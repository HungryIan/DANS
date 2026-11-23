using System.ComponentModel.DataAnnotations;

namespace Dans.Api.Infrastructure;

/// <summary>Validates that a checkbox-style boolean was ticked (for example agreeing to the privacy notice).</summary>
[AttributeUsage(AttributeTargets.Property)]
public sealed class MustBeTrueAttribute : ValidationAttribute
{
    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext) =>
        value is true
            ? ValidationResult.Success
            : new ValidationResult(ErrorMessage ?? "This must be accepted.", [validationContext.MemberName ?? "Value"]);
}
