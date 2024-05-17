import * as React from 'react';
import { ViewportProvider } from 'react-viewport-utils';

import { IStickyInjectedProps } from './types';

const StickyGroupContext = React.createContext({
  stickyOffset: { top: 0, height: 0 },
  updateStickyOffset: (offset: number, height: number) => {},
});

export const connect = () => <P extends object>(
  WrappedComponent: React.ComponentType<P & IStickyInjectedProps>,
) => {
  const ConnectedComponent: React.SFC<P> = (props) => (
    <StickyGroupContext.Consumer>
      {(context) => (
        <WrappedComponent
          {...props}
          stickyOffset={context.stickyOffset}
          updateStickyOffset={context.updateStickyOffset}
        />
      )}
    </StickyGroupContext.Consumer>
  );

  const displayName =
    WrappedComponent.displayName || WrappedComponent.name || 'Component';
  ConnectedComponent.displayName = `connectSticky(${displayName})`;

  return ConnectedComponent;
};

export default class StickyScrollUpProvider extends React.PureComponent {
  stickyOffset = {
    top: 0,
    height: 0,
  };

  updateStickyOffset = (stickyOffset: number, height: number) => {
    this.stickyOffset.top = Math.min(stickyOffset, height);
    this.stickyOffset.height = height;
  };

  render() {
    return (
      <ViewportProvider experimentalSchedulerEnabled>
        <StickyGroupContext.Provider
          value={{
            updateStickyOffset: this.updateStickyOffset,
            stickyOffset: this.stickyOffset,
          }}
        >
          {this.props.children}
        </StickyGroupContext.Provider>
      </ViewportProvider>
    );
  }
}
