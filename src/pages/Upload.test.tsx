/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Upload from './Upload';

const mockNavigate = vi.fn();
const mockPublishFileEvent = vi.fn();
const mockUploadFiles = vi.fn();
const mockIngestUpload = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../components/FileEventEditor/usePublishing', () => ({
  usePublishing: () => ({
    publishFileEvent: (...args: unknown[]) => mockPublishFileEvent(...args),
    publishAudioEvent: vi.fn(),
    publishVideoEvent: vi.fn(),
  }),
}));
vi.mock('../utils/transfer', () => ({
  transferBlob: vi.fn().mockResolvedValue({
    sha256: 'thumb123',
    url: 'https://primary.example/thumb.jpg',
    type: 'image/jpeg',
    size: 50,
  }),
}));
vi.mock('@/nostr/core', () => ({
  relayPool: { publish: vi.fn() },
  mergeRelays: (userRelays: string[] = []) => userRelays,
}));

vi.mock('../utils/nostr', () => ({
  useNostr: () => ({
    user: { pubkey: 'test-pubkey' },
    signEventTemplate: vi.fn(),
  }),
}));

let currentServers = [{ name: 'primary', url: 'https://primary.example', type: 'blossom' as const }];

vi.mock('../utils/useUserServers', () => ({
  useUserServers: () => ({
    servers: currentServers,
    serversLoading: false,
  }),
}));

vi.mock('../utils/useServerInfo', () => ({
  useServerInfo: () => ({
    serverInfo: Object.fromEntries(currentServers.map(s => [s.name, s])),
  }),
}));
vi.mock('../catalog/catalogClient', () => ({
  getCatalogClient: () => ({
    ingestUpload: mockIngestUpload,
  }),
}));

vi.mock('../utils/uploadRun', () => ({
  uploadFiles: (...args: unknown[]) => mockUploadFiles(...args),
}));

vi.mock('../utils/blur', () => ({
  getBlurhashAndSizeFromFile: async () => ({ width: 800, height: 600, blurHash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }),
}));

vi.mock('../utils/exif', () => ({
  removeExifData: async (file: File) => file,
}));

vi.mock('../utils/resize', () => ({
  resizeImage: async (file: File) => file,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  currentServers = [{ name: 'primary', url: 'https://primary.example', type: 'blossom' as const }];
});

describe('Upload workflow', () => {
  it('advances to populated description drafts and offers publish and skip actions on completed upload', async () => {
    const user = userEvent.setup();

    const uploadedFile = new File(['image-bytes'], 'vacation.jpg', { type: 'image/jpeg' });
    const descriptor = {
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      url: 'https://primary.example/vacation.jpg',
      type: 'image/jpeg',
      size: 11,
      uploaded: 1700000000,
    };

    mockUploadFiles.mockResolvedValue({
      verdict: 'allSucceeded',
      outcomes: [
        {
          state: 'done',
          value: {
            task: {
              server: { name: 'primary', url: 'https://primary.example', type: 'blossom' },
              file: uploadedFile,
            },
            descriptor,
          },
        },
      ],
      failed: [],
    });
    mockIngestUpload.mockResolvedValue(undefined);

    const { container } = render(
      <MemoryRouter>
        <Upload />
      </MemoryRouter>
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    await user.upload(input, uploadedFile);

    const uploadButton = await screen.findByRole('button', { name: /upload 1 file/i });
    await user.click(uploadButton);

    // Step 2 should be active and describe media drafts should render
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /publish nostr events/i })).toBeTruthy();
    });
    const skipButton = await screen.findByRole('button', { name: /skip publishing/i });
    const publishButton = await screen.findByRole('button', { name: /^publish/i });
    expect(skipButton).toBeTruthy();
    expect(publishButton).toBeTruthy();
    expect(screen.getByDisplayValue('vacation')).toBeTruthy();

    // Skip publishing navigates to /browse
    await user.click(skipButton);
    expect(mockNavigate).toHaveBeenCalledWith('/browse');
  });

  it('publishes Nostr metadata events and presents results upon clicking Publish', async () => {
    const user = userEvent.setup();
    const uploadedFile = new File(['image-bytes'], 'vacation.jpg', { type: 'image/jpeg' });
    const descriptor = {
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      url: 'https://primary.example/vacation.jpg',
      type: 'image/jpeg',
      size: 11,
      uploaded: 1700000000,
    };

    mockUploadFiles.mockResolvedValue({
      verdict: 'allSucceeded',
      outcomes: [
        {
          state: 'done',
          value: {
            task: {
              server: { name: 'primary', url: 'https://primary.example', type: 'blossom' },
              file: uploadedFile,
            },
            descriptor,
          },
        },
      ],
      failed: [],
    });
    mockIngestUpload.mockResolvedValue(undefined);
    mockPublishFileEvent.mockResolvedValue({
      id: 'a'.repeat(64),
      pubkey: 'b'.repeat(64),
      created_at: 1700000000,
      kind: 1063,
      tags: [],
      content: '',
      sig: '',
    });

    const { container } = render(
      <MemoryRouter>
        <Upload />
      </MemoryRouter>
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, uploadedFile);

    const uploadButton = await screen.findByRole('button', { name: /upload 1 file/i });
    await user.click(uploadButton);

    const publishButton = await screen.findByRole('button', { name: /^publish/i });
    await user.click(publishButton);

    // Advances to step 3 showing published event results
    expect(await screen.findByText(/publishing results/i)).toBeTruthy();
    expect(mockPublishFileEvent).toHaveBeenCalledOnce();
  });

  it('retains file selection and retries only failed destinations without repeating successful uploads', async () => {
    const user = userEvent.setup();
    currentServers = [
      { name: 'primary', url: 'https://primary.example', type: 'blossom' },
      { name: 'secondary', url: 'https://secondary.example', type: 'blossom' },
    ];

    const uploadedFile = new File(['image-bytes'], 'vacation.jpg', { type: 'image/jpeg' });
    const descriptor1 = {
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      url: 'https://primary.example/vacation.jpg',
      type: 'image/jpeg',
      size: 11,
      uploaded: 1700000000,
    };
    const descriptor2 = {
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      url: 'https://secondary.example/vacation.jpg',
      type: 'image/jpeg',
      size: 11,
      uploaded: 1700000000,
    };

    // First attempt: primary succeeds, secondary fails
    mockUploadFiles.mockResolvedValueOnce({
      verdict: 'failed',
      outcomes: [
        {
          state: 'done',
          value: {
            task: { server: currentServers[0], file: uploadedFile },
            descriptor: descriptor1,
          },
        },
        {
          state: 'error',
          error: new Error('Server secondary offline'),
        },
      ],
      failed: [1],
    });

    // Second attempt (retry): secondary succeeds
    mockUploadFiles.mockResolvedValueOnce({
      verdict: 'allSucceeded',
      outcomes: [
        {
          state: 'done',
          value: {
            task: { server: currentServers[1], file: uploadedFile },
            descriptor: descriptor2,
          },
        },
      ],
      failed: [],
    });

    const { container } = render(
      <MemoryRouter>
        <Upload />
      </MemoryRouter>
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, uploadedFile);

    const uploadButton = await screen.findByRole('button', { name: /upload 1 file/i });
    await user.click(uploadButton);

    // Error should be visible and Retry button should be accessible
    expect(await screen.findByText(/Server secondary offline/i)).toBeTruthy();
    const retryButton = await screen.findByRole('button', { name: /retry/i });
    expect(retryButton).toBeTruthy();

    // Trigger retry
    await user.click(retryButton);

    // Verify uploadFiles was called a 2nd time with ONLY the failed secondary task
    expect(mockUploadFiles).toHaveBeenCalledTimes(2);
    const secondCallArgs = mockUploadFiles.mock.calls[1][0] as {
      tasks?: { server: { name: string }; file: File }[];
      servers?: { name: string }[];
    };
    if (secondCallArgs.tasks) {
      expect(secondCallArgs.tasks.map(t => t.server.name)).toEqual(['secondary']);
    } else if (secondCallArgs.servers) {
      expect(secondCallArgs.servers.map(s => s.name)).toEqual(['secondary']);
    }

    // After retry succeeds, advances to step 2 with drafts containing both URLs
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /publish nostr events/i })).toBeTruthy();
    });

    const publishButton = await screen.findByRole('button', { name: /^publish/i });
    await user.click(publishButton);

    expect(mockPublishFileEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.arrayContaining([
          'https://primary.example/vacation.jpg',
          'https://secondary.example/vacation.jpg',
        ]),
      })
    );
  });
});
