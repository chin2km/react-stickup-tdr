import * as React from 'react';
import { ObserveViewport, IRect, IScroll } from 'react-viewport-utils';
import { shallowEqual } from 'recompose';

import { connect as connectStickyProvider } from './StickyProvider';
import StickyElement from './StickyElement';
import StickyPlaceholder from './StickyPlaceholder';
import {
  TRenderChildren,
  IStickyComponentProps,
  IStickyInjectedProps,
} from './types';
import { supportsWillChange } from './utils';

interface IOwnProps extends IStickyComponentProps {
  /**
   * The reference to the container to stick into. If this is not set, the component will be sticky regardless how far the user scrolls down.
   */
  container?: React.RefObject<any>;
  /**
   * The child node that is rendered within the sticky container. When rendered as a function it will add further information the the function which can be used e.g. to update stylings.
   */
  children?: TRenderChildren<{
    isSticky: boolean;
    isDockedToBottom: boolean;
    isNearToViewport: boolean;
  }>;
}

interface IProps extends IOwnProps, IStickyInjectedProps {}

interface IState {
  isSticky: boolean;
  isDockedToBottom: boolean;
  isNearToViewport: boolean;
  styles: React.CSSProperties;
}

interface ILayoutSnapshot {
  stickyRect: IRect;
  containerRect: IRect;
}

class Sticky extends React.PureComponent<IProps, IState> {
  private stickyRef: React.RefObject<any> = React.createRef();
  private placeholderRef: React.RefObject<any> = React.createRef();

  static defaultProps = {
    stickyOffset: { top: 0, height: 0 },
    defaultOffsetTop: 0,
    disableResizing: false,
    disableHardwareAcceleration: false,
    style: {},
  };

  state: IState = {
    isSticky: false,
    isDockedToBottom: false,
    isNearToViewport: false,
    styles: {},
  };

  get container() {
    return this.props.container || this.placeholderRef;
  }

  get offsetTop() {
    return this.props.stickyOffset.top + this.props.defaultOffsetTop;
  }

  hasContainer = () => {
    return Boolean(this.props.container);
  };

  isNearToViewport = (rect: IRect): boolean => {
    const padding = 300;
    return rect.top - padding < 0 && rect.bottom + padding > 0;
  };

  isSticky = (rect: IRect, containerRect: IRect) => {
    if (!this.hasContainer()) {
      return containerRect.top <= this.offsetTop;
    }

    if (containerRect.top > this.offsetTop) {
      return false;
    }

    if (containerRect.bottom - this.offsetTop < rect.height) {
      return false;
    }

    return true;
  };

  isDockedToBottom = (rect: IRect, containerRect: IRect) => {
    if (!rect || !containerRect) {
      return false;
    }

    if (!this.hasContainer()) {
      return false;
    }

    if (containerRect.bottom - this.offsetTop >= rect.height) {
      return false;
    }

    return true;
  };

  calcPositionStyles(
    rectSticky: IRect,
    containerRect: IRect,
    scroll: IScroll,
  ): React.CSSProperties {
    if (this.isSticky(rectSticky, containerRect)) {
      const stickyOffset = Math.round(this.props.stickyOffset.top);
      const stickyHeight = this.props.stickyOffset.height;
      const headIsFlexible = stickyOffset > 0 && stickyOffset < stickyHeight;
      if (headIsFlexible) {
        const relYTurn = scroll.yTurn - scroll.y - containerRect.top;
        return {
          position: 'absolute',
          top: relYTurn + this.offsetTop + scroll.yDTurn,
        };
      }

      return {
        position: 'fixed',
        top: this.offsetTop,
      };
    }

    if (this.isDockedToBottom(rectSticky, containerRect)) {
      return {
        position: 'absolute',
        top: containerRect.height - rectSticky.height,
      };
    }

    return {
      position: 'absolute',
      top: 0,
    };
  }

  getStickyStyles(
    rect: IRect,
    containerRect: IRect,
    scroll: IScroll,
  ): React.CSSProperties {
    const styles = this.calcPositionStyles(rect, containerRect, scroll);

    if (!this.props.disableHardwareAcceleration) {
      const shouldAccelerate = this.isNearToViewport(rect);
      if (supportsWillChange) {
        styles.willChange = shouldAccelerate ? 'position, top' : null;
      } else {
        styles.transform = shouldAccelerate ? `translateZ(0)` : null;
      }
    }

    return styles;
  }

  recalculateLayoutBeforeUpdate = (): ILayoutSnapshot => {
    const stickyRect = this.stickyRef.current.getBoundingClientRect();
    const containerRect = this.container.current.getBoundingClientRect();
    return {
      stickyRect,
      containerRect,
    };
  };

  handleScrollUpdate = (
    { scroll }: { scroll: IScroll },
    { stickyRect, containerRect }: ILayoutSnapshot,
  ) => {
    // in case children is not a function renderArgs will never be used
    const willRenderAsAFunction = typeof this.props.children === 'function';

    const styles = this.getStickyStyles(stickyRect, containerRect, scroll);
    const stateStyles = this.state.styles;
    const stylesDidChange = !shallowEqual(styles, stateStyles);
    const isSticky = willRenderAsAFunction
      ? this.isSticky(stickyRect, containerRect)
      : false;
    const isDockedToBottom = willRenderAsAFunction
      ? this.isDockedToBottom(stickyRect, containerRect)
      : false;
    const isNearToViewport = this.isNearToViewport(stickyRect);
    const isStickyDidChange = this.state.isSticky !== isSticky;
    const isDockedToBottomDidChange =
      this.state.isDockedToBottom !== isDockedToBottom;
    const isNearToViewportDidChange =
      this.state.isNearToViewport !== isNearToViewport;

    if (
      !stylesDidChange &&
      !isStickyDidChange &&
      !isDockedToBottomDidChange &&
      !isNearToViewportDidChange
    ) {
      return;
    }

    this.setState({
      isSticky,
      isDockedToBottom,
      isNearToViewport,
      styles: stylesDidChange ? styles : stateStyles,
    });
  };

  renderSticky = ({ isRecalculating }: { isRecalculating: boolean }) => {
    const { children, disabled, stickyProps } = this.props;
    return (
      <StickyElement<
        TRenderChildren<{
          isSticky: boolean;
          isDockedToBottom: boolean;
          isNearToViewport: boolean;
        }>
      >
        forwardRef={this.stickyRef}
        positionStyle={this.state.styles}
        disabled={disabled || isRecalculating}
        children={children}
        renderArgs={{
          isSticky: this.state.isSticky,
          isDockedToBottom: this.state.isDockedToBottom,
          isNearToViewport: this.state.isNearToViewport,
        }}
        {...stickyProps}
      />
    );
  };

  render() {
    const { disabled, disableResizing, style, className } = this.props;
    return (
      <>
        <StickyPlaceholder
          className={className}
          style={style}
          disabled={disabled}
          forwardRef={this.placeholderRef}
          stickyRef={this.stickyRef}
          disableResizing={disableResizing}
        >
          {this.renderSticky}
        </StickyPlaceholder>
        <ObserveViewport
          disableScrollUpdates={disabled}
          disableDimensionsUpdates
          onUpdate={this.handleScrollUpdate}
          recalculateLayoutBeforeUpdate={this.recalculateLayoutBeforeUpdate}
          priority={this.state.isNearToViewport ? 'highest' : 'low'}
        />
      </>
    );
  }
}

export default connectStickyProvider()<IOwnProps>(Sticky);
