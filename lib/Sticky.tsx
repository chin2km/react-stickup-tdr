import * as React from 'react';
import {
  ObserveViewport,
  IRect,
  IScroll,
  IDimensions,
} from 'react-viewport-utils';

import { connect as connectStickyProvider } from './StickyProvider';
import StickyElement from './StickyElement';
import StickyPlaceholder from './StickyPlaceholder';
import {
  TRenderChildren,
  IStickyComponentProps,
  IStickyInjectedProps,
  IPositionStyles,
} from './types';
import {
  supportsWillChange,
  shallowEqualPositionStyles,
  supportsPositionSticky,
} from './utils';

type OverflowScrollType = 'flow' | 'end';

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
    appliedOverflowScroll: OverflowScrollType;
  }>;
  /**
   * Defines how the sticky element should react in case its bigger than the viewport.
   * Different options are available:
   * * end: The default value will keep the component sticky as long as it reaches the bottom of its container and only then will scroll down.
   * * flow: The element scrolls with the flow of the scroll direction, therefore the content is easier to access.
   */
  overflowScroll?: OverflowScrollType;
  /**
   * A top offset to create a padding between the browser window and the sticky component when sticky.
   */
  defaultOffsetTop?: number;
  /**
   * Tries to detect when the usage of native `position: sticky` is possible and uses it as long as possible. This is an experimental property and might change in its behavior or disappear in the future.
   */
  experimentalNative?: boolean;
}

interface IProps extends IOwnProps, IStickyInjectedProps { }

interface IState {
  isSticky: boolean;
  isDockedToBottom: boolean;
  isNearToViewport: boolean;
  appliedOverflowScroll: OverflowScrollType;
  styles: IPositionStyles;
  useNativeSticky: boolean;
}

interface ILayoutSnapshot {
  stickyRect?: IRect;
  containerRect: IRect;
}

class Sticky extends React.PureComponent<IProps, IState> {
  private stickyRef: React.RefObject<HTMLElement> = React.createRef();
  private placeholderRef: React.RefObject<HTMLElement> = React.createRef();
  private nativeStickyThrewOnce: boolean = false;

  static defaultProps = {
    stickyOffset: { top: 0, height: 0 },
    defaultOffsetTop: 0,
    disableResizing: false,
    disableHardwareAcceleration: false,
    overflowScroll: 'end' as OverflowScrollType,
    experimentalNative: false,
    style: {},
  };

  state: IState = {
    isSticky: false,
    isDockedToBottom: false,
    isNearToViewport: false,
    appliedOverflowScroll: 'end',
    styles: {},
    useNativeSticky: false,
  };

  get container() {
    return this.props.container || this.placeholderRef;
  }

  get offsetTop() {
    return this.props.stickyOffset.top + this.props.defaultOffsetTop!;
  }

  hasContainer = () => {
    return Boolean(this.props.container);
  };

  isNearToViewport = (rect?: IRect): boolean => {
    const padding = 700;
    return (rect?.top || 0) - padding < 0 && (rect?.bottom || 0) + padding > 0;
  };

  getOverflowScrollType = (
    { rectSticky, dimensions }: {
      rectSticky?: IRect,
      dimensions: IDimensions,
    }
  ): OverflowScrollType => {
    return this.props.overflowScroll === 'flow' &&
      this.calcHeightDifference({ rectSticky, dimensions }) > 0
      ? 'flow'
      : 'end';
  };

  isSticky = ({ rect, containerRect, dimensions }: { rect?: IRect, containerRect?: IRect, dimensions: IDimensions }) => {
    if (!this.hasContainer()) {
      return Math.round(containerRect?.top || 0) <= this.offsetTop;
    }

    if (Math.round(containerRect?.top || 0) > this.offsetTop) {
      return false;
    }

    const height =
      this.props.overflowScroll === 'flow'
        ? Math.min(rect?.height || 0, dimensions.height)
        : rect?.height || 0;
    if (Math.round(containerRect?.bottom || 0) - this.offsetTop < height) {
      return false;
    }

    return true;
  };

  shouldUseNativeSticky = (appliedOverflowScroll: OverflowScrollType) => {
    if (
      !this.props.experimentalNative ||
      !supportsPositionSticky ||
      appliedOverflowScroll !== 'end' ||
      this.props.stickyOffset.top !== 0
    ) {
      return false;
    }

    if (
      process.env.NODE_ENV !== 'production' &&
      !this.nativeStickyThrewOnce &&
      (this.placeholderRef && this.placeholderRef.current?.parentElement) !==
      (this.props.container && this.props.container.current)
    ) {
      console.warn(
        'react-stickup: a sticky element was used with property `experimentalNative` but its `container` is not the parent the sticky component. As the native sticky implementation always uses its parent element as the container. This can lead to unexpected results. It is therefore recommended to change the DOM structure so that the container is a direct parent of the Sticky component or to remove the `experimentalNative` property.',
      );
      this.nativeStickyThrewOnce = true;
    }
    return true;
  };

  isDockedToBottom = (
    { rect, containerRect, dimensions }: {
      rect?: IRect,
      containerRect: IRect,
      dimensions: IDimensions,
    }
  ) => {
    if (!rect || !containerRect) {
      return false;
    }

    if (!this.hasContainer()) {
      return false;
    }

    if (rect.height > containerRect.height) {
      return false;
    }

    const height =
      this.props.overflowScroll === 'flow'
        ? Math.min(rect.height, dimensions.height)
        : rect.height;
    if (Math.round(containerRect.bottom) - this.offsetTop >= height) {
      return false;
    }

    return true;
  };

  calcHeightDifference({ rectSticky, dimensions }: { rectSticky?: IRect, dimensions: IDimensions }) {
    if (!dimensions) {
      return 0;
    }
    return Math.max(0, Math.round(rectSticky?.height || 0) - dimensions.height);
  }

  calcOverflowScrollFlowStickyStyles(
    { rectSticky, containerRect, scroll, dimensions }: {
      rectSticky?: IRect,
      containerRect: IRect,
      scroll: IScroll,
      dimensions: IDimensions,
    }
  ): IPositionStyles {
    const containerTop = Math.round(containerRect.top);
    const stickyTop = Math.round(rectSticky?.top || 0);
    const scrollY = Math.round(scroll.y);
    const scrollYTurn = Math.round(scroll.yTurn);
    const heightDiff = this.calcHeightDifference({ rectSticky, dimensions });
    const containerTopOffset =
      containerTop + scrollY - this.props.stickyOffset.height;
    const isStickyBottomReached =
      Math.round(rectSticky?.bottom || 0) <= dimensions.height;
    const isContainerTopReached = containerTop < this.offsetTop;
    const isTurnWithinHeightOffset =
      scrollYTurn - heightDiff <= containerTopOffset;
    const isTurnPointBeforeContainer = scrollYTurn < containerTopOffset;
    const isTurnPointAfterContainer =
      scrollYTurn > containerTopOffset + containerRect.height;
    const isTurnPointWithinContainer = !(
      isTurnPointBeforeContainer || isTurnPointAfterContainer
    );
    // scroll down AND sticky rect bottom not reached AND turn point not within the container OR
    // scroll up AND container top not reached OR
    //scroll up AND turns within the height diff AND turn point not within the container
    if (
      (scroll.isScrollingDown &&
        !isStickyBottomReached &&
        !isTurnPointWithinContainer) ||
      (scroll.isScrollingUp && !isContainerTopReached) ||
      (scroll.isScrollingUp &&
        isTurnWithinHeightOffset &&
        !isTurnPointWithinContainer)
    ) {
      return {
        position: 'absolute',
        top: 0,
      };
    }

    // scroll down AND sticky bottom reached
    if (scroll.isScrollingDown && isStickyBottomReached) {
      return {
        position: 'fixed',
        top: -heightDiff,
      };
    }

    const isStickyTopReached = stickyTop >= this.offsetTop;
    // scroll down AND turn point within container OR
    // scroll up AND turn point not before container AND not sticky top reached
    if (
      (scroll.isScrollingDown && isTurnPointWithinContainer) ||
      (scroll.isScrollingUp &&
        !isTurnPointBeforeContainer &&
        !isStickyTopReached)
    ) {
      return {
        position: 'absolute',
        top: Math.abs(scrollY - stickyTop + (containerTop - scrollY)),
      };
    }

    return {
      position: 'fixed',
      top: this.offsetTop,
    };
  }

  calcPositionStyles(
    { rectSticky, containerRect, scroll, dimensions }: {
      rectSticky?: IRect,
      containerRect: IRect,
      scroll: IScroll,
      dimensions: IDimensions,
    }
  ): IPositionStyles {
    if (this.isSticky({ rect: rectSticky, containerRect, dimensions })) {
      if (this.getOverflowScrollType({ rectSticky, dimensions }) === 'flow') {
        return this.calcOverflowScrollFlowStickyStyles(
          {
            rectSticky,
            containerRect,
            scroll,
            dimensions,
          }
        );
      }
      const stickyOffset = this.props.stickyOffset.top;
      const stickyHeight = this.props.stickyOffset.height;
      const headIsFlexible = stickyOffset > 0 && stickyOffset < stickyHeight;
      if (headIsFlexible) {
        const relYTurn =
          Math.round(scroll.yTurn - scroll.y + scroll.yDTurn) -
          Math.round(containerRect.top);
        return {
          position: 'absolute',
          top: relYTurn + this.offsetTop,
        };
      }

      return {
        position: 'fixed',
        top: this.offsetTop,
      };
    }

    if (this.isDockedToBottom({ rect: rectSticky, containerRect, dimensions })) {
      return {
        position: 'absolute',
        top: containerRect.height - (rectSticky?.height || 0),
      };
    }

    return {
      position: 'absolute',
      top: 0,
    };
  }

  getStickyStyles(
    { rect, containerRect, scroll, dimensions }: {
      rect?: IRect,
      containerRect: IRect,
      scroll: IScroll,
      dimensions: IDimensions,
    }
  ): IPositionStyles {
    const styles = this.calcPositionStyles(
      {
        rectSticky: rect,
        containerRect,
        scroll,
        dimensions,
      }
    );

    if (!this.props.disableHardwareAcceleration) {
      const shouldAccelerate = this.isNearToViewport(rect);
      if (supportsWillChange) {
        styles.willChange = shouldAccelerate ? 'position, top' : undefined;
      } else {
        styles.transform = shouldAccelerate ? `translateZ(0)` : undefined;
      }
    }

    return styles;
  }

  recalculateLayoutBeforeUpdate = (): ILayoutSnapshot => {
    const containerRect = this.container.current?.getBoundingClientRect();
    const stickyRect = this.stickyRef.current?.getBoundingClientRect();
    return {
      stickyRect,
      containerRect,
    };
  };

  handleScrollUpdate = (
    { scroll, dimensions }: { scroll: IScroll; dimensions: IDimensions },
    { stickyRect, containerRect }: ILayoutSnapshot,
  ) => {
    if (this.props.disabled) {
      return;
    }
    // in case children is not a function renderArgs will never be used
    const willRenderAsAFunction = typeof this.props.children === 'function';
    const appliedOverflowScroll = this.getOverflowScrollType({
      rectSticky: stickyRect,
      dimensions,
    });

    const useNativeSticky = this.shouldUseNativeSticky(appliedOverflowScroll);

    const styles = useNativeSticky
      ? {}
      : this.getStickyStyles({ rect: stickyRect, containerRect, scroll, dimensions });
    const stateStyles = this.state.styles;
    const stylesDidChange = !shallowEqualPositionStyles(styles, stateStyles);
    const isSticky = willRenderAsAFunction
      ? this.isSticky({ rect: stickyRect, containerRect, dimensions })
      : false;
    const isDockedToBottom = willRenderAsAFunction
      ? this.isDockedToBottom({ rect: stickyRect, containerRect, dimensions })
      : false;
    const isNearToViewport = this.isNearToViewport(stickyRect);
    const useNativeStickyDidChange =
      this.state.useNativeSticky !== useNativeSticky;
    const isStickyDidChange = this.state.isSticky !== isSticky;
    const isDockedToBottomDidChange =
      this.state.isDockedToBottom !== isDockedToBottom;
    const isNearToViewportDidChange =
      this.state.isNearToViewport !== isNearToViewport;
    const appliedOverflowScrollDidChange =
      appliedOverflowScroll !== this.state.appliedOverflowScroll;

    if (
      !useNativeStickyDidChange &&
      !stylesDidChange &&
      !isStickyDidChange &&
      !isDockedToBottomDidChange &&
      !isNearToViewportDidChange &&
      !appliedOverflowScrollDidChange
    ) {
      return;
    }

    this.setState({
      useNativeSticky,
      isSticky,
      isDockedToBottom,
      isNearToViewport,
      appliedOverflowScroll,
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
          appliedOverflowScroll: OverflowScrollType;
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
          appliedOverflowScroll: this.state.appliedOverflowScroll,
        }}
        {...stickyProps}
      />
    );
  };

  render() {
    const {
      disabled,
      disableResizing,
      style,
      className,
      overflowScroll,
    } = this.props;
    return (
      <>
        <StickyPlaceholder
          className={className}
          style={
            this.state.useNativeSticky
              ? {
                position: 'sticky',
                top: this.props.defaultOffsetTop,
                ...style,
              }
              : style
          }
          disabled={!!disabled}
          forwardRef={this.placeholderRef}
          stickyRef={this.stickyRef}
          disableResizing={!!disableResizing}
        >
          {this.renderSticky}
        </StickyPlaceholder>
        <ObserveViewport
          disableScrollUpdates={disabled}
          disableDimensionsUpdates={disabled || overflowScroll !== 'flow'}
          onUpdate={this.handleScrollUpdate as any}
          recalculateLayoutBeforeUpdate={this.recalculateLayoutBeforeUpdate}
          priority={this.state.isNearToViewport ? 'highest' : 'low'}
        />
      </>
    );
  }
}

export default connectStickyProvider()<IOwnProps>(Sticky);
