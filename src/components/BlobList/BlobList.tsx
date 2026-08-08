import { useEffect, useMemo, useState, useCallback } from 'react';
import { BlobDescriptor } from 'blossom-client-sdk';
import {
  Clipboard,
  AlertTriangle,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { formatFileSize, formatDate } from '../../utils/utils';
import { useServerInfo } from '../../utils/useServerInfo';
import Badge from './Badge';
import useFileMetaEventsByHash from '../../utils/useFileMetaEvents';
import { eventKindLabel } from '../../catalog/eventKinds';
import { extractTimelineEventMetadata } from '../../catalog/timelineMetadata';
import './BlobList.css';
import { useBlobSelection } from './useBlobSelection';
import MimeTypeIcon from '../MimeTypeIcon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DeleteProgressDialog from './DeleteProgressDialog';

type BlobListProps = {
  blobs: BlobDescriptor[];
  onDelete?: (blob: BlobDescriptor) => Promise<void>;
  title?: string;
  className?: string;
};

const PAGE_SIZE_OPTIONS = [20, 50, 100, 500] as const;

const BlobList = ({ blobs, onDelete, title, className = '' }: BlobListProps) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const { distribution } = useServerInfo();
  const fileMetaEventsByHash = useFileMetaEventsByHash();
  const { handleSelectBlob, selectedBlobs, setSelectedBlobs } = useBlobSelection(blobs);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [blobsToDelete, setBlobsToDelete] = useState<BlobDescriptor[]>([]);

  const handleDeleteSelected = useCallback(() => {
    const selected = blobs.filter(b => selectedBlobs[b.sha256 || b.url]);
    if (selected.length === 0) return;
    setBlobsToDelete(selected);
    setDeleteDialogOpen(true);
  }, [blobs, selectedBlobs]);

  const handleDeleteDialogClose = useCallback(() => {
    // Backing out of the confirmation must not discard the selection the user
    // just built; it is cleared once a deletion has actually run.
    setDeleteDialogOpen(false);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [blobs]);

  const totalPages = Math.ceil(blobs.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedBlobs = useMemo(() => blobs.slice(startIndex, endIndex), [blobs, startIndex, endIndex]);

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  };

  const selectedCount = useMemo(() => Object.values(selectedBlobs).filter(v => v).length, [selectedBlobs]);

  const pageKeys = useMemo(() => paginatedBlobs.map(b => b.sha256 || b.url), [paginatedBlobs]);

  const selectedOnPage = useMemo(() => pageKeys.filter(k => selectedBlobs[k]).length, [pageKeys, selectedBlobs]);

  const allPageSelected = pageKeys.length > 0 && selectedOnPage === pageKeys.length;
  const somePageSelected = selectedOnPage > 0 && !allPageSelected;

  const handleSelectAllPage = () => {
    if (allPageSelected) {
      setSelectedBlobs(prev => {
        const next = { ...prev };
        pageKeys.forEach(k => delete next[k]);
        return next;
      });
    } else {
      setSelectedBlobs(prev => {
        const next = { ...prev };
        pageKeys.forEach(k => (next[k] = true));
        return next;
      });
    }
  };

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Header bar */}
      <div className={`flex flex-wrap items-center gap-2 ${!title ? 'justify-end' : ''}`}>
        {title && <h2 className="flex-1 text-lg font-semibold">{title}</h2>}

        {selectedCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">{selectedCount} selected</span>
            {onDelete && (
              <Button
                size="sm"
                variant="destructive"
                /* 28px is a hard target on a phone, and this one deletes files. */
                className="h-9 min-w-9"
                onClick={handleDeleteSelected}
                aria-label={`Delete ${selectedCount} selected file${selectedCount === 1 ? '' : 's'}`}
                title="Delete selected files"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={() => setSelectedBlobs({})}
              aria-label="Clear selection"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        )}
      </div>

      {/* Safety net: even with the secondary columns hidden, a long title must
          scroll the table rather than the whole page. */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 px-4">
                <Checkbox
                  checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                  onCheckedChange={handleSelectAllPage}
                  aria-label="Select all on page"
                />
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Event</TableHead>
              <TableHead className="hidden text-xs font-medium uppercase tracking-wide text-muted-foreground sm:table-cell">
                Uses
              </TableHead>
              <TableHead className="hidden text-xs font-medium uppercase tracking-wide text-muted-foreground sm:table-cell">
                Size
              </TableHead>
              <TableHead className="hidden text-xs font-medium uppercase tracking-wide text-muted-foreground sm:table-cell">
                Date
              </TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedBlobs.map(blob => {
              const key = blob.sha256 || blob.url;
              return (
                <TableRow
                  key={key}
                  data-state={selectedBlobs[key] ? 'selected' : undefined}
                  className="cursor-pointer"
                  onClick={e => handleSelectBlob(key, e)}
                >
                  <TableCell className="px-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={!!selectedBlobs[key]}
                        onCheckedChange={() => handleSelectBlob(key)}
                        onClick={e => e.stopPropagation()}
                      />
                      <MimeTypeIcon type={blob.type} />
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[180px] sm:max-w-[320px]">
                    {(() => {
                      const event = fileMetaEventsByHash[blob.sha256]?.[0];
                      const hash = blob.sha256 ? blob.sha256.slice(0, 15) : blob.url.slice(blob.url.length - 15);

                      if (!event) {
                        return (
                          <div className="flex min-w-0 flex-col gap-1">
                            <span className="font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              No event
                            </span>
                            <a
                              className="w-fit font-mono text-xs text-primary hover:underline"
                              href={blob.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {hash}
                            </a>
                          </div>
                        );
                      }

                      // One source of truth for titles, so a file cannot be named one thing in
                      // Browse and another here. This helper also treats `alt` as a summary
                      // rather than a title, which a local reimplementation got wrong.
                      const { title: eventTitle } = extractTimelineEventMetadata(event);

                      return (
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-medium" title={eventTitle}>
                              {eventTitle}
                            </span>
                            <span className="shrink-0 border border-border px-1 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              {eventKindLabel(event.kind)}
                            </span>
                          </div>
                          <a
                            className="w-fit font-mono text-[10px] text-muted-foreground hover:text-primary hover:underline"
                            href={blob.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {hash}
                          </a>
                        </div>
                      );
                    })()}
                    {/* Size and date are their own columns from sm up; on a phone
                        they ride along here rather than disappearing. */}
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground sm:hidden">
                      {formatFileSize(blob.size)} · {formatDate(blob.uploaded)}
                    </p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex items-center gap-1">
                      <Badges blob={blob} fileMetaEventsByHash={fileMetaEventsByHash} />
                      {distribution[blob.sha256]?.servers.length === 1 && (
                        <span className="text-yellow-500" title="Not distributed to any other server">
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm tabular-nums text-muted-foreground sm:table-cell">
                    {formatFileSize(blob.size)}
                  </TableCell>
                  <TableCell className="hidden text-sm tabular-nums text-muted-foreground sm:table-cell">
                    {formatDate(blob.uploaded)}
                  </TableCell>
                  <TableCell className="px-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0"
                      aria-label="Copy link to this file"
                      title="Copy link to clipboard"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigator.clipboard.writeText(blob.url);
                      }}
                    >
                      <Clipboard className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Show</span>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map(size => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>per page</span>
        </div>

        <span>
          {startIndex + 1}–{Math.min(endIndex, blobs.length)} of {blobs.length}
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            title="First page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2">
            Page {currentPage} of {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages || totalPages === 0}
            title="Last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {onDelete && (
        <DeleteProgressDialog
          open={deleteDialogOpen}
          blobs={blobsToDelete}
          onDeleteOne={onDelete}
          onClose={handleDeleteDialogClose}
          onDeletionFinished={() => setSelectedBlobs({})}
        />
      )}
    </div>
  );
};

const Badges = ({
  blob,
  fileMetaEventsByHash,
}: {
  blob: BlobDescriptor;
  fileMetaEventsByHash: ReturnType<typeof useFileMetaEventsByHash>;
}) => {
  const events = fileMetaEventsByHash[blob.sha256];
  if (!events) return null;
  return (
    <>
      {events.map(ev => (
        <Badge ev={ev} key={ev.id} />
      ))}
    </>
  );
};

export default BlobList;
