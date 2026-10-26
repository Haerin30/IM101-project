import React, { useEffect, useRef, useState } from "react";
import { Alert } from "./components";
import { formatDate, purposePreview, recordName } from "./presentation";
import { useRecordNames } from "./names";

// Each request remains bounded and uses the unchanged ownership-scoped read API.
// Stop each batch at 1,000 rows; never silently claim a partial history is complete.
export async function reservationBatch(api, signal, page = 1) {
    const rows = [];
    for (let count = 0; count < 10; count++, page++) {
        const data = await api.request(`/reservations?page=${page}&limit=100`, {
            signal,
        });
        rows.push(...data.reservations);
        if (!data.pagination.hasMore) return { rows, next: null };
    }
    return { rows, next: page };
}
export function monthDays(month) {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    start.setDate(start.getDate() - start.getDay());
    return Array.from(
        { length: 42 },
        (_, index) =>
            new Date(
                start.getFullYear(),
                start.getMonth(),
                start.getDate() + index,
            ),
    );
}
export default function ReservationCalendar({
    api,
    catalogs,
    onSelect,
    onRefreshCatalogs,
}) {
    const [compact, setCompact] = useState(() => window.innerWidth <= 700);
    useEffect(() => {
        const resize = () => setCompact(window.innerWidth <= 700);
        window.addEventListener("resize", resize);
        return () => window.removeEventListener("resize", resize);
    }, []);
    const [month, setMonth] = useState(
        () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    );
    const [rows, setRows] = useState([]),
        [next, setNext] = useState(null),
        [loading, setLoading] = useState(true),
        [error, setError] = useState(""),
        [revision, setRevision] = useState(0);
    const pending = useRef(false),
        currentController = useRef(null);
    useEffect(() => {
        const controller = new AbortController();
        currentController.current = controller;
        setLoading(true);
        setError("");
        setRows([]);
        setNext(null);
        pending.current = true;
        reservationBatch(api, controller.signal)
            .then((result) => {
                if (!controller.signal.aborted) {
                    setRows(result.rows);
                    setNext(result.next);
                }
            })
            .catch((err) => {
                if (!controller.signal.aborted) setError(err.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                    pending.current = false;
                }
            });
        return () => controller.abort();
    }, [api, revision]);
    async function more() {
        if (pending.current || !next) return;
        pending.current = true;
        setLoading(true);
        setError("");
        const controller = currentController.current;
        try {
            const result = await reservationBatch(api, controller.signal, next);
            if (!controller.signal.aborted) {
                setRows((previous) => [...previous, ...result.rows]);
                setNext(result.next);
            }
        } catch (err) {
            if (!controller.signal.aborted) setError(err.message);
        } finally {
            if (!controller.signal.aborted) {
                pending.current = false;
                setLoading(false);
            }
        }
    }
    const approvedId = catalogs.statuses?.find(
        (status) => status.statusName === "Approved",
    )?.statusId;
    const approved = rows
        .filter(
            (row) => approvedId !== undefined && row.statusId === approvedId,
        )
        .sort(
            (a, b) =>
                new Date(a.startDatetime) - new Date(b.startDatetime) ||
                a.reservationId - b.reservationId,
        );
    const names = useRecordNames(approved, catalogs, api);
    return (
        <section
            className="panel reservation-calendar"
            aria-label="Approved reservation calendar"
        >
            <div className="calendar-toolbar">
                <div>
                    <h2>
                        {month.toLocaleDateString("en-US", {
                            month: "long",
                            year: "numeric",
                        })}
                    </h2>
                    <p className="muted">
                        Approved reservations visible to your account. This is
                        not a campus-wide availability calendar.
                    </p>
                </div>
                <div className="toolbar-actions">
                    <button
                        className="button secondary small"
                        onClick={() =>
                            setMonth(
                                new Date(
                                    month.getFullYear(),
                                    month.getMonth() - 1,
                                    1,
                                ),
                            )
                        }
                    >
                        Previous month
                    </button>
                    <button
                        className="button secondary small"
                        onClick={() =>
                            setMonth(
                                new Date(
                                    new Date().getFullYear(),
                                    new Date().getMonth(),
                                    1,
                                ),
                            )
                        }
                    >
                        Today
                    </button>
                    <button
                        className="button secondary small"
                        onClick={() =>
                            setMonth(
                                new Date(
                                    month.getFullYear(),
                                    month.getMonth() + 1,
                                    1,
                                ),
                            )
                        }
                    >
                        Next month
                    </button>
                    <button
                        className="button secondary small"
                        disabled={loading}
                        onClick={() => {
                            setRevision((value) => value + 1);
                            onRefreshCatalogs?.();
                        }}
                    >
                        Refresh calendar
                    </button>
                </div>
            </div>
            <Alert>
                {error ||
                    (catalogs.unavailable
                        ? "Some catalog names or statuses could not be loaded. Refresh the reservation section."
                        : "")}
            </Alert>
            {!catalogs.statuses ? (
                <p role="status">
                    {catalogs.unavailable
                        ? "Reservation statuses are unavailable. Refresh the calendar to try again."
                        : "Loading reservation statuses…"}
                </p>
            ) : approvedId === undefined ? (
                <p role="status">
                    The Approved reservation status is not configured.
                </p>
            ) : (
                <>
                    {loading && <p role="status">Loading reservations…</p>}
                    {next && (
                        <p className="form-note">
                            Only loaded history is shown.{" "}
                            <button
                                className="button secondary small"
                                disabled={loading}
                                onClick={more}
                            >
                                Load more reservations
                            </button>
                        </p>
                    )}
                    {!loading && !error && !approved.length && (
                        <p className="calendar-empty">
                            No approved reservations in the loaded history.
                        </p>
                    )}
                    {compact ? (
                        <div className="agenda-list">
                            {!approved.some(
                                (row) =>
                                    new Date(row.startDatetime) <
                                        new Date(
                                            month.getFullYear(),
                                            month.getMonth() + 1,
                                            1,
                                        ) && new Date(row.endDatetime) > month,
                            ) && (
                                <p className="calendar-empty">
                                    No approved reservations this month.
                                </p>
                            )}
                            {monthDays(month)
                                .filter(
                                    (day) =>
                                        day.getMonth() === month.getMonth(),
                                )
                                .map((day) => {
                                    const end = new Date(
                                            day.getFullYear(),
                                            day.getMonth(),
                                            day.getDate() + 1,
                                        ),
                                        events = approved.filter(
                                            (row) =>
                                                new Date(row.startDatetime) <
                                                    end &&
                                                new Date(row.endDatetime) > day,
                                        );
                                    return events.length ? (
                                        <section
                                            className="agenda-day"
                                            key={day.toISOString()}
                                        >
                                            <h3>
                                                {formatDate(
                                                    `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
                                                    true,
                                                )}
                                            </h3>
                                            {events.map((row) => (
                                                <button
                                                    className="calendar-event"
                                                    key={row.reservationId}
                                                    onClick={() =>
                                                        onSelect({
                                                            ...row,
                                                            statusName:
                                                                "Approved",
                                                        })
                                                    }
                                                >
                                                    <strong>
                                                        {purposePreview(
                                                            row.purpose,
                                                        )}
                                                    </strong>
                                                    <span>
                                                        {recordName(
                                                            row.facilityId,
                                                            "facility",
                                                            names,
                                                        )}
                                                    </span>
                                                    <span>
                                                        {formatDate(
                                                            row.startDatetime,
                                                        )}{" "}
                                                        –{" "}
                                                        {formatDate(
                                                            row.endDatetime,
                                                        )}
                                                    </span>
                                                </button>
                                            ))}
                                        </section>
                                    ) : null;
                                })}
                        </div>
                    ) : (
                        <div className="calendar-scroll">
                            <div className="calendar-grid">
                                {[
                                    "Sun",
                                    "Mon",
                                    "Tue",
                                    "Wed",
                                    "Thu",
                                    "Fri",
                                    "Sat",
                                ].map((day) => (
                                    <div className="calendar-weekday" key={day}>
                                        {day}
                                    </div>
                                ))}
                                {monthDays(month).map((day) => {
                                    const end = new Date(
                                        day.getFullYear(),
                                        day.getMonth(),
                                        day.getDate() + 1,
                                    );
                                    const events = approved.filter(
                                        (row) =>
                                            new Date(row.startDatetime) < end &&
                                            new Date(row.endDatetime) > day,
                                    );
                                    return (
                                        <section
                                            className={`calendar-day ${day.getMonth() === month.getMonth() ? "" : "outside-month"}`}
                                            key={day.toISOString()}
                                            aria-label={formatDate(
                                                `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
                                                true,
                                            )}
                                        >
                                            <span className="calendar-day-number">
                                                {day.getDate()}
                                            </span>
                                            {events.map((row) => (
                                                <button
                                                    type="button"
                                                    className="calendar-event"
                                                    key={row.reservationId}
                                                    onClick={() =>
                                                        onSelect({
                                                            ...row,
                                                            statusName:
                                                                "Approved",
                                                        })
                                                    }
                                                >
                                                    <strong>
                                                        {purposePreview(
                                                            row.purpose,
                                                        )}
                                                    </strong>
                                                    <span>
                                                        {recordName(
                                                            row.facilityId,
                                                            "facility",
                                                            names,
                                                        )}
                                                    </span>
                                                    <span>
                                                        {formatDate(
                                                            row.startDatetime,
                                                        )}{" "}
                                                        –{" "}
                                                        {formatDate(
                                                            row.endDatetime,
                                                        )}
                                                    </span>
                                                </button>
                                            ))}
                                        </section>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
