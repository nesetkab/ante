import type { LibraryApi } from '@shared/library'

export const library = (window as unknown as { anteLibrary: LibraryApi }).anteLibrary
