import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { MyList } from './my-list';

/**
 * The one My List store, reachable from anywhere inside the shell.
 *
 * It is a context rather than a module-level singleton because the list belongs
 * to one User on one Server: a different User signing in gets a different
 * store, and nothing from the last one can be left behind in it.
 */
const MyListContext = createContext<MyList | undefined>(undefined);

export const MyListProvider = MyListContext.Provider;

/**
 * The store, and a re-render of this component whenever the list changes. That
 * is what makes a Title added from a card on Home appear in the Row beside it
 * and on the My List page at the same moment.
 */
export function useMyList(): MyList {
  const myList = useContext(MyListContext);
  const [, setChanges] = useState(0);

  useEffect(() => {
    if (myList === undefined) return;
    return myList.subscribe(() => {
      setChanges((changes) => changes + 1);
    });
  }, [myList]);

  if (myList === undefined) {
    // A screen showing My List outside the shell is a wiring mistake, and a
    // store that quietly did nothing would hide it.
    throw new Error('My List is only available inside the app shell.');
  }
  return myList;
}
