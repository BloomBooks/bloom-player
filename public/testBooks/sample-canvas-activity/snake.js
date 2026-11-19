"use strict";

const kCellsInEachDimension = 10;

// This file implements IActivityModule (though at the moment it is javascript, so there's
// no way to say that)

export function activityRequirements() {
    return {
        dragging: true,
        clicking: true, // well actually we don't need this, but we're saying 'true' so we can test this
        typing: true // arrow keys
    };
}

// This implements IActivityObject (though at the moment it is javascript, so there's
// no way to say that)
export default class SnakeActivity {
    // The player constructs a fresh object each time the page is shown, so the game starts fresh
    // whether the user comes back to this page or goes on to another instance of the activity.
    constructor(pageElement) {
        this.running = true;
        this.frameCount = 0;
        this.canvas = pageElement.getElementsByTagName("canvas")[0];
        this.minDimension = Math.min(this.canvas.width, this.canvas.height);
        this.grid = this.minDimension / kCellsInEachDimension; // 16;
        this.context = this.canvas.getContext("2d");
        this.startX = 0;
        this.startY = 0;

        this.snake = {
            x: 160,
            y: 160,
            dx: this.grid,
            dy: 0,
            cells: [],
            maxCells: 4
        };

        this.apple = {
            x: this.grid * 3,
            y: this.grid * 3
        };
        // we need to 1) bind our listeners to this object so we can use "this.",
        // and 2) keep track of them so we can remove them when the user moves
        // away from this page
        this.listeners = [];
    }
    // Called once when the book loads, on a copy of the page's html. The game needs no setup there.
    /* public */ initializePageHtml() {}

    // Called each time the page becomes the current one, on the real DOM.
    /* public */ showingPage() {
        this.addEventListener("touchstart", this.handleTouchstart);
        this.addEventListener("touchmove", this.handleTouchMove);
        this.addEventListener("touchend", this.handleTouchEnd);
        this.addEventListener("keydown", this.handleKeydown);
        window.requestAnimationFrame(this.loop.bind(this));
    }
    addEventListener(name, func) {
        const boundFunc = func.bind(this);
        this.listeners.push({ name, boundFunc });
        document.addEventListener(name, boundFunc);
    }
    // When our page is not the selected one, the bloom-player calls this.
    // We need to disconnect any listeners.
    /* public */ stop() {
        this.running = false;
        this.listeners.forEach(l =>
            document.removeEventListener(l.name, l.boundFunc)
        );
    }

    handleKeydown(e) {
        // prevent this.snake from backtracking on itself
        if (e.which === 37 && this.snake.dx === 0) {
            this.snake.dx = -this.grid;
            this.snake.dy = 0;
        } else if (e.which === 38 && this.snake.dy === 0) {
            this.snake.dy = -this.grid;
            this.snake.dx = 0;
        } else if (e.which === 39 && this.snake.dx === 0) {
            this.snake.dx = this.grid;
            this.snake.dy = 0;
        } else if (e.which === 40 && this.snake.dy === 0) {
            this.snake.dy = this.grid;
            this.snake.dx = 0;
        }
        e.preventDefault();
    }

    handleTouchEnd(e) {
        var touch = e.changedTouches[0];
        this.distX = touch.pageX - this.startX;
        this.distY = touch.pageY - this.startY;
        if (Math.abs(this.distX) > Math.abs(this.distY)) {
            if (this.distX > 0 && this.snake.dx === 0) {
                this.snake.dx = this.grid;
                this.snake.dy = 0;
            } else if (this.distX < 0 && this.snake.dx === 0) {
                this.snake.dx = -this.grid;
                this.snake.dy = 0;
            }
        } else {
            if (this.distY > 0 && this.snake.dy === 0) {
                this.snake.dy = this.grid;
                this.snake.dx = 0;
            } else if (this.distY < 0 && this.snake.dy === 0) {
                this.snake.dy = -this.grid;
                this.snake.dx = 0;
            }
        }
        e.preventDefault();
    }

    handleTouchMove(e) {
        e.preventDefault();
    }

    handleTouchstart(e) {
        var touch = e.changedTouches[0];
        this.startX = touch.pageX;
        this.startY = touch.pageY;
        this.startTime = new Date().getTime();
        e.preventDefault();
    }

    getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    }

    // game this.loop
    loop() {
        if (this.running) {
            window.requestAnimationFrame(this.loop.bind(this));
        }

        // slow game this.loop to 15 fps instead of 60 - 60/15 = 4
        if (++this.frameCount < 8) {
            return;
        }

        this.frameCount = 0;
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.snake.x += this.snake.dx;
        this.snake.y += this.snake.dy;

        // wrap this.snake position on edge of screen
        if (this.snake.x < 0) {
            this.snake.x = this.canvas.width - this.grid;
        } else if (this.snake.x >= this.canvas.width) {
            this.snake.x = 0;
        }

        if (this.snake.y < 0) {
            this.snake.y = this.canvas.height - this.grid;
        } else if (this.snake.y >= this.canvas.height) {
            this.snake.y = 0;
        }

        // keep track of where this.snake has been. front of the array is always the head
        this.snake.cells.unshift({ x: this.snake.x, y: this.snake.y });

        // remove cells as we move away from them
        if (this.snake.cells.length > this.snake.maxCells) {
            this.snake.cells.pop();
        }

        // draw this.apple
        this.context.fillStyle = "red";
        this.context.fillRect(
            this.apple.x,
            this.apple.y,
            this.grid - 1,
            this.grid - 1
        );

        // draw this.snake
        this.context.fillStyle = "green";
        this.snake.cells.forEach((cell, index) => {
            this.context.fillRect(cell.x, cell.y, this.grid - 1, this.grid - 1);

            // this.snake ate this.apple
            if (cell.x === this.apple.x && cell.y === this.apple.y) {
                this.snake.maxCells++;

                this.apple.x =
                    this.getRandomInt(0, kCellsInEachDimension - 1) * this.grid;
                this.apple.y =
                    this.getRandomInt(0, kCellsInEachDimension - 1) * this.grid;
            }

            // check collision with all cells after this one (modified bubble sort)
            for (var i = index + 1; i < this.snake.cells.length; i++) {
                // collision. reset game
                if (
                    cell.x === this.snake.cells[i].x &&
                    cell.y === this.snake.cells[i].y
                ) {
                    this.snake.x = this.grid * 10;
                    this.snake.y = this.grid * 10;
                    this.snake.cells = [];
                    this.snake.maxCells = 4;
                    this.snake.dx = this.grid;
                    this.snake.dy = 0;

                    this.apple.x =
                        this.getRandomInt(0, kCellsInEachDimension - 1) *
                        this.grid;
                    this.apple.y =
                        this.getRandomInt(0, kCellsInEachDimension - 1) *
                        this.grid;
                }
            }
        });
    }
}
