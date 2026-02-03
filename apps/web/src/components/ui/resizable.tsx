'use client';

import * as React from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResizablePanelGroupProps {
  direction?: 'horizontal' | 'vertical';
  children: React.ReactNode;
  className?: string;
  autoSaveId?: string;
}

interface ResizablePanelProps {
  children: React.ReactNode;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  collapsible?: boolean;
  collapsedSize?: number;
  className?: string;
  order?: number;
}

interface ResizableHandleProps {
  className?: string;
  withHandle?: boolean;
}

export function ResizablePanelGroup({
  direction = 'horizontal',
  children,
  className,
  autoSaveId,
}: ResizablePanelGroupProps) {
  return (
    <Group
      orientation={direction}
      className={cn('flex h-full w-full', className)}
      id={autoSaveId}
    >
      {children}
    </Group>
  );
}

export function ResizablePanel({
  children,
  defaultSize = 50,
  minSize = 10,
  maxSize,
  collapsible = false,
  collapsedSize = 0,
  className,
}: ResizablePanelProps) {
  return (
    <Panel
      defaultSize={defaultSize}
      minSize={minSize}
      maxSize={maxSize}
      collapsible={collapsible}
      collapsedSize={collapsedSize}
      className={cn('overflow-hidden', className)}
    >
      {children}
    </Panel>
  );
}

export function ResizableHandle({
  className,
  withHandle = true,
}: ResizableHandleProps) {
  return (
    <Separator
      className={cn(
        'relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1',
        className
      )}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
          <GripVertical className="h-2.5 w-2.5" />
        </div>
      )}
    </Separator>
  );
}

// Pre-built layouts
interface TwoPanelLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
  leftDefaultSize?: number;
  leftMinSize?: number;
  rightMinSize?: number;
  autoSaveId?: string;
  className?: string;
}

export function TwoPanelLayout({
  left,
  right,
  leftDefaultSize = 50,
  leftMinSize = 20,
  rightMinSize = 20,
  autoSaveId,
  className,
}: TwoPanelLayoutProps) {
  return (
    <ResizablePanelGroup
      direction="horizontal"
      autoSaveId={autoSaveId}
      className={className}
    >
      <ResizablePanel defaultSize={leftDefaultSize} minSize={leftMinSize}>
        {left}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={100 - leftDefaultSize} minSize={rightMinSize}>
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

interface ThreePanelLayoutProps {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
  leftDefaultSize?: number;
  centerDefaultSize?: number;
  minSize?: number;
  autoSaveId?: string;
  className?: string;
}

export function ThreePanelLayout({
  left,
  center,
  right,
  leftDefaultSize = 25,
  centerDefaultSize = 50,
  minSize = 15,
  autoSaveId,
  className,
}: ThreePanelLayoutProps) {
  return (
    <ResizablePanelGroup
      direction="horizontal"
      autoSaveId={autoSaveId}
      className={className}
    >
      <ResizablePanel defaultSize={leftDefaultSize} minSize={minSize} collapsible>
        {left}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={centerDefaultSize} minSize={minSize}>
        {center}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel
        defaultSize={100 - leftDefaultSize - centerDefaultSize}
        minSize={minSize}
        collapsible
      >
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

interface VerticalSplitLayoutProps {
  top: React.ReactNode;
  bottom: React.ReactNode;
  topDefaultSize?: number;
  topMinSize?: number;
  bottomMinSize?: number;
  autoSaveId?: string;
  className?: string;
}

export function VerticalSplitLayout({
  top,
  bottom,
  topDefaultSize = 60,
  topMinSize = 20,
  bottomMinSize = 20,
  autoSaveId,
  className,
}: VerticalSplitLayoutProps) {
  return (
    <ResizablePanelGroup
      direction="vertical"
      autoSaveId={autoSaveId}
      className={className}
    >
      <ResizablePanel defaultSize={topDefaultSize} minSize={topMinSize}>
        {top}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={100 - topDefaultSize} minSize={bottomMinSize}>
        {bottom}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

// IDE-like layout with sidebar, main content, and bottom panel
interface IDELayoutProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  bottomPanel?: React.ReactNode;
  sidebarDefaultSize?: number;
  bottomPanelDefaultSize?: number;
  autoSaveId?: string;
  className?: string;
}

export function IDELayout({
  sidebar,
  main,
  bottomPanel,
  sidebarDefaultSize = 20,
  bottomPanelDefaultSize = 30,
  autoSaveId = 'ide-layout',
  className,
}: IDELayoutProps) {
  return (
    <ResizablePanelGroup
      direction="horizontal"
      autoSaveId={autoSaveId}
      className={className}
    >
      <ResizablePanel
        defaultSize={sidebarDefaultSize}
        minSize={15}
        maxSize={40}
        collapsible
        collapsedSize={0}
      >
        {sidebar}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={100 - sidebarDefaultSize} minSize={40}>
        {bottomPanel ? (
          <ResizablePanelGroup direction="vertical" autoSaveId={`${autoSaveId}-vertical`}>
            <ResizablePanel defaultSize={100 - bottomPanelDefaultSize} minSize={30}>
              {main}
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel
              defaultSize={bottomPanelDefaultSize}
              minSize={15}
              collapsible
              collapsedSize={0}
            >
              {bottomPanel}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          main
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
