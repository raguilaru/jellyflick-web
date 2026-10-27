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
  const rendered = myList?.version();

  useEffect(() => {
    if (myList === undefined) return;
    const changed = (): void => {
      setChanges((changes) => changes + 1);
    };
    const stop = myList.subscribe(changed);
    // A subscription can only be made once this has rendered, and a change in
    // between — a press on a card the moment it appeared — would otherwise
    // never be drawn. This is the one place that gap is closed.
    if (myList.version() !== rendered) changed();
    return stop;
    // `rendered` is deliberately not a dependency: it is only the number this
    // render saw, and the subscription covers every change after the first.
  }, [myList]);

  if (myList === undefined) {
    // A screen showing My List outside the shell is a wiring mistake, and a
    // store that quietly did nothing would hide it.
    throw new Error('My List is only available inside the app shell.');
  }
  return myList;
}
