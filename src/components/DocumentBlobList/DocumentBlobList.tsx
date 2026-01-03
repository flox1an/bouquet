import { formatFileSize, formatDate } from '../../utils/utils';
import { Clipboard } from 'lucide-react';
import { BlobDescriptor } from 'blossom-client-sdk';
import { Document, Page } from 'react-pdf';
import { Button } from '@/components/ui/button';

type DocumentBlobListProps = {
  docs: BlobDescriptor[];
  onDelete?: (blob: BlobDescriptor) => void;
};

const DocumentBlobList = ({ docs }: DocumentBlobListProps) => (
  <div className="blob-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2 justify-center">
    {docs.map(blob => (
      <div key={blob.sha256} className="p-4 rounded-lg bg-muted relative flex flex-col">
        <a href={blob.url} target="_blank" className="block overflow-clip text-ellipsis py-2 m-auto">
          <Document file={blob.url}>
            <Page pageIndex={0} width={300} renderTextLayer={false} renderAnnotationLayer={false} renderForms={false} />
          </Document>
        </a>
        <div className="flex flex-grow flex-row text-xs pt-4 items-end">
          <span>{formatFileSize(blob.size)}</span>
          <span className="flex-grow text-right">{formatDate(blob.uploaded)}</span>
        </div>
        <div className="absolute bottom-10 right-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Copy link to clipboard"
            onClick={() => navigator.clipboard.writeText(blob.url)}
          >
            <Clipboard className="h-4 w-4" />
          </Button>
        </div>
      </div>
    ))}
  </div>
);

export default DocumentBlobList;
