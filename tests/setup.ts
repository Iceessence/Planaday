import 'fake-indexeddb/auto';
import { ensureTemporal } from '../src/core/temporal';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

await ensureTemporal();
