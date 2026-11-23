import { Pipe, PipeTransform } from '@angular/core';
import { typeIcon } from '../core/meta';
import { DisasterType } from '../core/models';

/** "5 min ago", "3 hrs ago", "2 days ago"... */
@Pipe({ name: 'timeAgo' })
export class TimeAgoPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    const seconds = Math.round((Date.now() - date.getTime()) / 1000);
    if (seconds < 45) return 'just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

/** Material Symbols icon name for a disaster type. */
@Pipe({ name: 'typeIcon' })
export class TypeIconPipe implements PipeTransform {
  transform(type: DisasterType): string {
    return typeIcon(type);
  }
}

/** Lower-case CSS class for a severity, e.g. "sev-high". */
@Pipe({ name: 'sevClass' })
export class SeverityClassPipe implements PipeTransform {
  transform(severity: string): string {
    return `sev-${severity.toLowerCase()}`;
  }
}
