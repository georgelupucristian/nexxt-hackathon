// Where friends' numbers come from. A provider only ever hands back what's on the device; the
// screens send nothing but the phone numbers to matching (repo.matchContacts), never a name, and
// the numbers without an account are dropped right after (nothing in the social world keeps them).
// Names stay on the device, in the screen's memory, so the invite list can say who's who.

export interface DeviceContact {
  name: string;
  /** as written in the address book: "0722 111 001", "+40 722…", "0040…" */
  phones: string[];
}

export interface ContactsProvider {
  readonly kind: 'mock' | 'web-picker' | 'native';
  /** false: no way to read contacts here; offer adding by number instead */
  supported(): boolean;
  /** Must be called from a user gesture (a tap on "Allow access"). Empty when the person picks nothing. */
  pick(): Promise<DeviceContact[]>;
}

/**
 * The demo address book: 12 people, 5 of whom have Kip (Ana, Mihai, Ioana, Radu, Elena). Their
 * numbers are written the many ways real address books write them, which matching has to handle.
 */
export const DEMO_ADDRESS_BOOK: DeviceContact[] = [
  { name: 'Ana Popescu', phones: ['0722 111 001'] },
  { name: 'Mum', phones: ['0744 210 330'] },
  { name: 'Mihai Ionescu', phones: ['+40 722 111 002'] },
  { name: 'Laura Vasile', phones: ['0755 482 117'] },
  { name: 'Ioana Marin', phones: ['0040 722 111 003'] },
  { name: 'Dan from the dorm', phones: ['0766 905 214'] },
  { name: 'Radu Stan', phones: ['(0722) 111-004', '021 312 4567'] },
  { name: 'Paul Georgescu', phones: ['0733 601 778'] },
  { name: 'Elena Dobre', phones: ['+40722111005'] },
  { name: 'Sorina Toma', phones: ['0745 118 442'] },
  { name: 'Grandma', phones: ['0236 414 909'] },
  { name: 'Tudor from the gym', phones: ['0787 330 615'] },
];

export class MockContactsProvider implements ContactsProvider {
  readonly kind = 'mock' as const;
  constructor(private book: DeviceContact[] = DEMO_ADDRESS_BOOK) {}
  supported() {
    return true;
  }
  async pick() {
    // the system sheet takes a moment on a real phone too
    await new Promise((r) => setTimeout(r, 250));
    return this.book.map((c) => ({ ...c, phones: [...c.phones] }));
  }
}

interface ContactsManagerLike {
  select(props: ('name' | 'tel')[], options?: { multiple?: boolean }): Promise<{ name?: string[]; tel?: string[] }[]>;
}

/**
 * The Contact Picker API (Chrome on Android): the person picks contacts in the system sheet and only
 * those come back. Feature-detected; elsewhere `supported()` is false and the screen falls back to
 * adding a friend by number.
 */
export class WebContactPickerProvider implements ContactsProvider {
  readonly kind = 'web-picker' as const;
  supported() {
    return typeof navigator !== 'undefined' && 'contacts' in navigator && typeof window !== 'undefined' && 'ContactsManager' in window;
  }
  async pick() {
    if (!this.supported()) return [];
    const manager = (navigator as unknown as { contacts: ContactsManagerLike }).contacts;
    try {
      const picked = await manager.select(['name', 'tel'], { multiple: true });
      return picked.map((c) => ({ name: c.name?.[0] ?? '', phones: c.tel ?? [] })).filter((c) => c.phones.length > 0);
    } catch {
      // closed the sheet, or the browser said no: nothing picked
      return [];
    }
  }
}

// TODO(native): an Expo build reads the whole address book with permission, via expo-contacts:
//   const { status } = await Contacts.requestPermissionsAsync();
//   if (status === 'granted') { const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] }); … }
// It would implement ContactsProvider with kind 'native' and the same rule: numbers go to matching,
// names stay on the phone.

/**
 * The provider this build uses. The social layer is simulated (mock users, mock matching), so the
 * demo address book is the one that finds anybody; a real Contact Picker would only return numbers
 * the mock world doesn't know. With a backend, prefer the Web picker where it exists.
 */
export function contactsProvider(simulated = true): ContactsProvider | null {
  if (simulated) return new MockContactsProvider();
  const web = new WebContactPickerProvider();
  return web.supported() ? web : null;
}
