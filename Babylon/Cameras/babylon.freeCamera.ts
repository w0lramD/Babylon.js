﻿module BABYLON {
    export class FreeCamera extends TargetCamera {
        public ellipsoid = new BABYLON.Vector3(0.5, 1, 0.5);
        public keysUp = [38];
        public keysDown = [40];
        public keysLeft = [37];
        public keysRight = [39];
        public checkCollisions = false;
        public applyGravity = false;
        public angularSensibility = 2000.0;
        public onCollide: (collidedMesh: AbstractMesh) => void;

        private _keys = [];
        private _collider = new Collider();
        private _needMoveForGravity = false;
        private _oldPosition = BABYLON.Vector3.Zero();
        private _diffPosition = BABYLON.Vector3.Zero();
        private _newPosition = BABYLON.Vector3.Zero();
        private _newPositionBuffer = BABYLON.Vector3.Zero();
        private _attachedElement: HTMLElement;
        private _localDirection: Vector3;
        private _transformedDirection: Vector3;

        private _onMouseDown: (e: MouseEvent) => any;
        private _onMouseUp: (e: MouseEvent) => any;
        private _onMouseOut: (e: MouseEvent) => any;
        private _onMouseMove: (e: MouseEvent) => any;
        private _onKeyDown: (e: KeyboardEvent) => any;
        private _onKeyUp: (e: KeyboardEvent) => any;
        public _onLostFocus: (e: FocusEvent) => any;

        public _waitingLockedTargetId: string;

        constructor(name: string, position: Vector3, scene: Scene) {
            super(name, position, scene);
        }

        // Controls
        public attachControl(element: HTMLElement, noPreventDefault?: boolean): void {
            var previousPosition;
            var engine = this.getEngine();

            if (this._attachedElement) {
                return;
            }
            this._attachedElement = element;

            if (this._onMouseDown === undefined) {
                this._onMouseDown = evt => {
                    previousPosition = {
                        x: evt.clientX,
                        y: evt.clientY
                    };

                    if (!noPreventDefault) {
                        evt.preventDefault();
                    }
                };

                this._onMouseUp = evt => {
                    previousPosition = null;
                    if (!noPreventDefault) {
                        evt.preventDefault();
                    }
                };

                this._onMouseOut = evt => {
                    previousPosition = null;
                    this._keys = [];
                    if (!noPreventDefault) {
                        evt.preventDefault();
                    }
                };

                this._onMouseMove = evt => {
                    if (!previousPosition && !engine.isPointerLock) {
                        return;
                    }

                    var offsetX;
                    var offsetY;

                    if (!engine.isPointerLock) {
                        offsetX = evt.clientX - previousPosition.x;
                        offsetY = evt.clientY - previousPosition.y;
                    } else {
                        offsetX = evt.movementX || evt.mozMovementX || evt.webkitMovementX || evt.msMovementX || 0;
                        offsetY = evt.movementY || evt.mozMovementY || evt.webkitMovementY || evt.msMovementY || 0;
                    }

                    this.cameraRotation.y += offsetX / this.angularSensibility;
                    this.cameraRotation.x += offsetY / this.angularSensibility;

                    previousPosition = {
                        x: evt.clientX,
                        y: evt.clientY
                    };
                    if (!noPreventDefault) {
                        evt.preventDefault();
                    }
                };

                this._onKeyDown = evt => {
                    if (this.keysUp.indexOf(evt.keyCode) !== -1 ||
                        this.keysDown.indexOf(evt.keyCode) !== -1 ||
                        this.keysLeft.indexOf(evt.keyCode) !== -1 ||
                        this.keysRight.indexOf(evt.keyCode) !== -1) {
                        var index = this._keys.indexOf(evt.keyCode);

                        if (index === -1) {
                            this._keys.push(evt.keyCode);
                        }
                        if (!noPreventDefault) {
                            evt.preventDefault();
                        }
                    }
                };

                this._onKeyUp = evt => {
                    if (this.keysUp.indexOf(evt.keyCode) !== -1 ||
                        this.keysDown.indexOf(evt.keyCode) !== -1 ||
                        this.keysLeft.indexOf(evt.keyCode) !== -1 ||
                        this.keysRight.indexOf(evt.keyCode) !== -1) {
                        var index = this._keys.indexOf(evt.keyCode);

                        if (index >= 0) {
                            this._keys.splice(index, 1);
                        }
                        if (!noPreventDefault) {
                            evt.preventDefault();
                        }
                    }
                };

                this._onLostFocus = () => {
                    this._keys = [];
                };

                this._reset = () => {
                    this._keys = [];
                    previousPosition = null;
                    this.cameraDirection = new BABYLON.Vector3(0, 0, 0);
                    this.cameraRotation = new BABYLON.Vector2(0, 0);
                };
            }

            element.addEventListener("mousedown", this._onMouseDown, false);
            element.addEventListener("mouseup", this._onMouseUp, false);
            element.addEventListener("mouseout", this._onMouseOut, false);
            element.addEventListener("mousemove", this._onMouseMove, false);

            Tools.RegisterTopRootEvents([
                { name: "keydown", handler: this._onKeyDown },
                { name: "keyup", handler: this._onKeyUp },
                { name: "blur", handler: this._onLostFocus }
            ]);
        }

        public detachControl(element: HTMLElement): void {
            if (this._attachedElement != element) {
                return;
            }

            element.removeEventListener("mousedown", this._onMouseDown);
            element.removeEventListener("mouseup", this._onMouseUp);
            element.removeEventListener("mouseout", this._onMouseOut);
            element.removeEventListener("mousemove", this._onMouseMove);

            Tools.UnregisterTopRootEvents([
                { name: "keydown", handler: this._onKeyDown },
                { name: "keyup", handler: this._onKeyUp },
                { name: "blur", handler: this._onLostFocus }
            ]);

            this._attachedElement = null;
            if (this._reset) {
                this._reset();
            }
        }

        public _collideWithWorld(velocity: Vector3, gravityInspection: boolean = false): void {
            var globalPosition: Vector3;

            if (this.parent) {
                globalPosition = BABYLON.Vector3.TransformCoordinates(gravityInspection ? this._newPositionBuffer : this.position, this.parent.getWorldMatrix());
            } else {
                globalPosition = this.position;
            }

            globalPosition.subtractFromFloatsToRef(0, this.ellipsoid.y, 0, this._oldPosition);
            this._collider.radius = this.ellipsoid;

            //in case we are using web workers, add gravity to the velocity to prevent the dual-collision checking
            if (this.getScene().workerCollisions) {
                velocity.addInPlace(this.getScene().gravity);
            }

            this.getScene().collisionCoordinator.getNewPosition(this._oldPosition, velocity, this._collider, 3, null, this._onCollisionPositionChange, gravityInspection ? this.uniqueId + 100000 : this.uniqueId);
            
        }

        private _onCollisionPositionChange = (collisionId: number, newPosition: Vector3, collidedMesh: AbstractMesh = null) => {
            var fromGravity: boolean = collisionId !== this.uniqueId;

            //TODO move this to the collision coordinator!
            if (this.getScene().workerCollisions)
                newPosition.multiplyInPlace(this._collider.radius);

            var updatePosition = (newPos) => {
                this._newPosition.copyFrom(newPos);

                this._newPosition.subtractToRef(this._oldPosition, this._diffPosition);

                var oldPosition = this.position.clone();
                if (this._diffPosition.length() > Engine.CollisionsEpsilon) {
                    this.position.addInPlace(this._diffPosition);
                    if (this.onCollide && collidedMesh) {
                        this.onCollide(collidedMesh);
                    }
                }
                //check if it is the gravity inspection
                if (fromGravity) {
                    this._needMoveForGravity = (BABYLON.Vector3.DistanceSquared(oldPosition, this.position) != 0);
                }
            }    
            
            updatePosition(newPosition);
        }
        
        public _checkInputs(): void {
            if (!this._localDirection) {
                this._localDirection = BABYLON.Vector3.Zero();
                this._transformedDirection = BABYLON.Vector3.Zero();
            }

            // Keyboard
            for (var index = 0; index < this._keys.length; index++) {
                var keyCode = this._keys[index];
                var speed = this._computeLocalCameraSpeed();

                if (this.keysLeft.indexOf(keyCode) !== -1) {
                    this._localDirection.copyFromFloats(-speed, 0, 0);
                } else if (this.keysUp.indexOf(keyCode) !== -1) {
                    this._localDirection.copyFromFloats(0, 0, speed);
                } else if (this.keysRight.indexOf(keyCode) !== -1) {
                    this._localDirection.copyFromFloats(speed, 0, 0);
                } else if (this.keysDown.indexOf(keyCode) !== -1) {
                    this._localDirection.copyFromFloats(0, 0, -speed);
                }

                this.getViewMatrix().invertToRef(this._cameraTransformMatrix);
                BABYLON.Vector3.TransformNormalToRef(this._localDirection, this._cameraTransformMatrix, this._transformedDirection);
                this.cameraDirection.addInPlace(this._transformedDirection);
            }
        }

        public _decideIfNeedsToMove(): boolean {
            return this._needMoveForGravity || Math.abs(this.cameraDirection.x) > 0 || Math.abs(this.cameraDirection.y) > 0 || Math.abs(this.cameraDirection.z) > 0;
        }

        public _updatePosition(): void {
            if (this.checkCollisions && this.getScene().collisionsEnabled) {
                this._collideWithWorld(this.cameraDirection, false);
                if (this.applyGravity && !this.getScene().workerCollisions) {
                    this._collideWithWorld(this.getScene().gravity, true);
                }
            } else {
                this.position.addInPlace(this.cameraDirection);
            }
        }

        public _update(): void {
            this._checkInputs();
            super._update();
        }

    }
} 