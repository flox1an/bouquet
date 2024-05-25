import { AddressPointer } from 'nostr-tools/nip19';
import { KIND_BLOSSOM_DRIVE, KIND_FILE_META } from '../../utils/useFileMetaEvents';
import { nip19 } from 'nostr-tools';
import { EventPointer, NDKEvent } from '@nostr-dev-kit/ndk';

const Badge = ({ ev }: { ev: NDKEvent }) => {
  if (ev.kind == KIND_FILE_META) {
    const nevent = nip19.neventEncode({
      kind: ev.kind,
      id: ev.id,
      author: ev.author.pubkey,
      relays: ev.onRelays.map(r => r.url),
    } as EventPointer);
    return (
      <a target="_blank" href={`https://filestr.vercel.app/e/${nevent}`}>
        <div className="badge badge-primary mr-2">filemeta</div>
      </a>
    );
  }

  if (ev.kind == KIND_BLOSSOM_DRIVE) {
    const naddr = nip19.naddrEncode({
      kind: ev.kind,
      identifier: ev.tagValue('d'),
      pubkey: ev.author.pubkey,
      relays: ev.onRelays.map(r => r.url),
    } as AddressPointer);
    return (
      <a target="_blank" className="badge badge-primary mr-2" href={`https://blossom.hzrd149.com/#/drive/${naddr}`}>
        🌸 drive
      </a>
    );
  }

  return <></>;
};

export default Badge;
